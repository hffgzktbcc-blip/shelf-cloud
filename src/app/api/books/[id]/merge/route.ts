import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseAudiobookTitle } from "@/lib/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mergeSchema = z.object({
  fromBookId: z.string(),
  /** Report what would move without changing anything. */
  dryRun: z.boolean().optional(),
});

/**
 * Folds one book into another.
 *
 * A novel split across several YouTube uploads arrives as several books, because each upload
 * is its own video. Merging turns them back into one book with several parts, which is what
 * the schema always supported — parts, bookmarks and ebooks all hang off a single book.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: intoId } = await ctx.params;
  const parsed = mergeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { fromBookId, dryRun } = parsed.data;
  if (fromBookId === intoId) {
    return NextResponse.json({ error: "A book can't merge into itself" }, { status: 400 });
  }

  const [into, from] = await Promise.all([
    prisma.book.findUnique({ where: { id: intoId }, include: { parts: true, ebooks: true } }),
    prisma.book.findUnique({ where: { id: fromBookId }, include: { parts: true, ebooks: true } }),
  ]);
  if (!into || !from) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  // An ebook already present by name is the same file loaded twice; its sync marks are still
  // worth keeping, because they may cover a different part of the audio.
  const existingNames = new Set(into.ebooks.map((e) => e.fileName));
  const duplicateEbooks = from.ebooks.filter((e) => existingNames.has(e.fileName));
  const movingEbooks = from.ebooks.filter((e) => !existingNames.has(e.fileName));

  const [bookmarks, aiMessages, marksToMove] = await Promise.all([
    prisma.bookmark.count({ where: { bookId: fromBookId } }),
    prisma.aiMessage.count({ where: { bookId: fromBookId } }),
    duplicateEbooks.length
      ? prisma.syncMark.count({ where: { ebookId: { in: duplicateEbooks.map((e) => e.id) } } })
      : Promise.resolve(0),
  ]);

  const summary = {
    into: { id: into.id, title: into.title, parts: into.parts.length },
    from: { id: from.id, title: from.title, parts: from.parts.length },
    moving: {
      parts: from.parts.length,
      bookmarks,
      aiMessages,
      ebooks: movingEbooks.length,
      duplicateEbooksFolded: duplicateEbooks.length,
      syncMarksRehomed: marksToMove,
    },
  };

  if (dryRun) return NextResponse.json(summary);

  await prisma.$transaction(async (tx) => {
    // Order by the part number in the upload title, so "Part 2" lands before "Part 3"
    // whichever direction the merge ran. Uploads without a number keep their relative
    // position, after the numbered ones.
    const all = [
      ...into.parts.map((p) => ({ part: p, wasHere: true })),
      ...from.parts.map((p) => ({ part: p, wasHere: false })),
    ];
    const numbered = all.map((x) => ({
      ...x,
      num: parseAudiobookTitle(x.part.title, x.part.channel).partNumber,
    }));
    numbered.sort((a, b) => {
      if (a.num !== null && b.num !== null) return a.num - b.num;
      if (a.num !== null) return -1;
      if (b.num !== null) return 1;
      if (a.wasHere !== b.wasHere) return a.wasHere ? -1 : 1;
      return a.part.order - b.part.order;
    });

    for (let i = 0; i < numbered.length; i++) {
      await tx.part.update({
        where: { id: numbered[i].part.id },
        data: { bookId: intoId, order: i },
      });
    }

    // Bookmarks point at a part as well as a book, and those parts just moved.
    await tx.bookmark.updateMany({ where: { bookId: fromBookId }, data: { bookId: intoId } });
    await tx.aiMessage.updateMany({ where: { bookId: fromBookId }, data: { bookId: intoId } });

    for (const e of movingEbooks) {
      await tx.ebook.update({ where: { id: e.id }, data: { bookId: intoId } });
    }

    // Same file, same block indices — so the marks transfer intact onto the copy we keep.
    for (const dup of duplicateEbooks) {
      const keeper = into.ebooks.find((e) => e.fileName === dup.fileName)!;
      await tx.syncMark.updateMany({ where: { ebookId: dup.id }, data: { ebookId: keeper.id } });
      await tx.ebook.delete({ where: { id: dup.id } });
    }

    // Everything that mattered has moved; the cascade now has nothing left to take.
    await tx.book.delete({ where: { id: fromBookId } });
  });

  return NextResponse.json({ ...summary, merged: true });
}
