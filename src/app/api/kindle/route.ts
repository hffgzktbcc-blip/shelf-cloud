import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { locateInBlocks, parseKindleExport } from "@/lib/kindle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  bookId: z.string(),
  raw: z.string().min(20).max(4_000_000),
  /** Preview first so nothing is written until the user sees what matched. */
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { bookId, raw, dryRun } = parsed.data;

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      parts: { orderBy: { order: "asc" } },
      ebooks: { include: { syncMarks: true } },
    },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const highlights = parseKindleExport(raw);
  if (highlights.length === 0) {
    return NextResponse.json(
      { error: "No highlights found. Paste a My Clippings.txt file, or your notes from read.amazon.com/notebook." },
      { status: 422 },
    );
  }

  // Placing a highlight on the timeline needs the book's text plus an alignment.
  const ebook = book.ebooks.find((e) => e.blocksJson);
  const blocks: { index: number; text: string }[] = ebook?.blocksJson
    ? JSON.parse(ebook.blocksJson).blocks
    : [];
  const marks = (ebook?.syncMarks ?? [])
    .filter((m) => m.blockIndex != null)
    .sort((a, b) => a.blockIndex! - b.blockIndex!);

  const canPlace = blocks.length > 0 && marks.length > 0;

  const placed = highlights.map((h) => {
    if (!canPlace) return { ...h, blockIndex: null, timeSec: null, partId: null };

    const blockIndex = locateInBlocks(h.text, blocks);
    if (blockIndex === null) return { ...h, blockIndex: null, timeSec: null, partId: null };

    // Interpolate between the surrounding sync marks.
    let before = marks[0];
    let after: (typeof marks)[number] | null = null;
    for (const m of marks) {
      if (m.blockIndex! <= blockIndex) before = m;
      else {
        after = m;
        break;
      }
    }
    let timeSec = before.timeSec;
    if (after && after.blockIndex! !== before.blockIndex!) {
      const frac = (blockIndex - before.blockIndex!) / (after.blockIndex! - before.blockIndex!);
      timeSec = before.timeSec + frac * (after.timeSec - before.timeSec);
    }
    return { ...h, blockIndex, timeSec, partId: before.partId };
  });

  const matched = placed.filter((p) => p.timeSec !== null);

  if (dryRun) {
    return NextResponse.json({
      total: highlights.length,
      matched: matched.length,
      canPlace,
      sample: placed.slice(0, 5).map((p) => ({
        preview: p.text.slice(0, 80),
        located: p.timeSec !== null,
        timeSec: p.timeSec,
      })),
    });
  }

  const created = await prisma.$transaction(
    matched.map((p) =>
      prisma.bookmark.create({
        data: {
          bookId,
          partId: p.partId ?? book.parts[0].id,
          timeSec: p.timeSec ?? 0,
          label: "From Kindle",
          note: p.text.slice(0, 500),
        },
      }),
    ),
  );

  return NextResponse.json({
    imported: created.length,
    total: highlights.length,
    skipped: highlights.length - created.length,
  });
}
