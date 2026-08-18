import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { LibraryClient, type LibraryBook, type Passage } from "./library-client";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  // First run only: an empty shelf with no welcome on record.
  const seen = await prisma.setting.findUnique({ where: { key: "welcomeSeen" } });
  if (!seen) {
    const existing = await prisma.book.count();
    if (existing === 0) redirect("/welcome");
  }

  const books = await prisma.book.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      parts: { orderBy: { order: "asc" } },
      ebooks: { select: { id: true } },
      _count: { select: { bookmarks: true } },
    },
  });

  const shaped: LibraryBook[] = books.map((book) => {
    const totalDuration = book.parts.reduce((sum, p) => sum + p.duration, 0);
    const listened = book.parts.reduce(
      (sum, p) => sum + (p.completed ? p.duration : p.positionSec),
      0,
    );
    const resume =
      book.parts.find((p) => p.id === book.lastPartId) ??
      book.parts.find((p) => !p.completed) ??
      book.parts[0];

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      series: book.series,
      coverUrl: book.coverUrl,
      partCount: book.parts.length,
      ebookCount: book.ebooks.length,
      bookmarkCount: book._count.bookmarks,
      totalDuration,
      listened,
      resumePartId: resume?.id ?? null,
    };
  });

  /**
   * One saved passage, surfaced again. Chosen by the calendar date rather than at random,
   * so it stays put through the day instead of reshuffling on every refresh.
   */
  const quoted = await prisma.bookmark.findMany({
    where: { quote: { not: null } },
    include: { book: { select: { id: true, title: true, author: true, coverUrl: true } } },
    orderBy: { createdAt: "asc" },
  });

  let passage: Passage | null = null;
  if (quoted.length > 0) {
    const today = new Date().toLocaleDateString("en-CA");
    const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
    const pick = quoted[seed % quoted.length];
    passage = {
      quote: pick.quote!,
      timeSec: pick.timeSec,
      bookId: pick.book.id,
      partId: pick.partId,
      bookTitle: pick.book.title,
      bookAuthor: pick.book.author,
      coverUrl: pick.book.coverUrl,
    };
  }

  return <LibraryClient books={shaped} passage={passage} />;
}
