import { prisma } from "@/lib/db";
import { LibraryClient, type LibraryBook } from "./library-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library — Shelf" };

export default async function LibraryPage() {
  const [books, shelves, queued] = await Promise.all([
    prisma.book.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        parts: { orderBy: { order: "asc" }, include: { _count: { select: { chapters: true } } } },
        ebooks: { include: { syncMarks: { select: { blockIndex: true } } } },
        shelves: { select: { shelfId: true } },
        _count: { select: { bookmarks: true } },
      },
    }),
    prisma.shelf.findMany({ orderBy: { order: "asc" }, include: { books: { select: { bookId: true } } } }),
    prisma.queueItem.findMany({ select: { bookId: true } }),
  ]);

  const inQueue = new Set(queued.map((q) => q.bookId));

  const shaped: LibraryBook[] = books.map((book) => {
    const totalDuration = book.parts.reduce((s, p) => s + p.duration, 0);
    const listened = book.parts.reduce((s, p) => s + p.positionSec, 0);
    const resume =
      book.parts.find((p) => !p.completed && p.positionSec > 0) ??
      book.parts.find((p) => !p.completed) ??
      book.parts[0];

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      series: book.series,
      coverUrl: book.coverUrl,
      partCount: book.parts.length,
      chapterCount: book.parts.reduce((s, p) => s + p._count.chapters, 0),
      ebookCount: book.ebooks.length,
      // "Aligned" means the text can actually follow the narration, not merely that a
      // file exists — that's the distinction the shelf could never show.
      alignedMarks: book.ebooks.reduce(
        (s, e) => s + e.syncMarks.filter((m) => m.blockIndex !== null).length,
        0,
      ),
      bookmarkCount: book._count.bookmarks,
      totalDuration,
      listened,
      resumePartId: resume?.id ?? null,
      addedAt: book.createdAt.toISOString(),
      shelfIds: book.shelves.map((s) => s.shelfId),
      queued: inQueue.has(book.id),
    };
  });

  return (
    <LibraryClient
      books={shaped}
      shelves={shelves.map((s) => ({ id: s.id, name: s.name, count: s.books.length }))}
    />
  );
}
