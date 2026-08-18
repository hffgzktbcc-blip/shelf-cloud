import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { LibraryClient, type LibraryBook } from "./library-client";

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

  return <LibraryClient books={shaped} />;
}
