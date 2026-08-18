import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAudiobookTitle } from "@/lib/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-derives the book's display fields from its first part's raw YouTube title.
 * Part titles are left alone, so the original is always recoverable.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const book = await prisma.book.findUnique({
    where: { id },
    include: { parts: { orderBy: { order: "asc" }, take: 1 } },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const first = book.parts[0];
  if (!first) return NextResponse.json({ error: "This book has no parts yet" }, { status: 400 });

  const clean = parseAudiobookTitle(first.title, first.channel);

  const updated = await prisma.book.update({
    where: { id },
    data: {
      title: clean.title,
      author: clean.author ?? book.author,
      series: clean.series ?? book.series,
    },
  });

  return NextResponse.json({ book: updated, parsed: clean });
}
