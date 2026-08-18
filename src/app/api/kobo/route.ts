import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { findKoboDevices, listKoboBooks, readKoboHighlights } from "@/lib/kobo";
import { placeHighlights } from "@/lib/highlights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports whether a Kobo is plugged in, and which of its books carry highlights. */
export async function GET() {
  const devices = findKoboDevices();
  if (devices.length === 0) {
    return NextResponse.json({ connected: false, books: [] });
  }

  const device = devices[0];
  try {
    return NextResponse.json({
      connected: true,
      volume: device.volume,
      books: listKoboBooks(device.dbPath),
    });
  } catch (e) {
    return NextResponse.json({ connected: false, error: (e as Error).message, books: [] });
  }
}

const bodySchema = z.object({
  bookId: z.string(),
  contentId: z.string().optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { bookId, contentId, dryRun } = parsed.data;

  const devices = findKoboDevices();
  if (devices.length === 0) {
    return NextResponse.json({ error: "No Kobo connected. Plug it in and unlock it." }, { status: 404 });
  }

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { parts: { orderBy: { order: "asc" } }, ebooks: { include: { syncMarks: true } } },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let highlights;
  try {
    highlights = readKoboHighlights(devices[0].dbPath, contentId);
  } catch (e) {
    return NextResponse.json({ error: `Could not read the Kobo: ${(e as Error).message}` }, { status: 422 });
  }

  if (highlights.length === 0) {
    return NextResponse.json({ error: "No highlights found on the device for that book." }, { status: 422 });
  }

  const ebook = book.ebooks.find((e) => e.blocksJson);
  const blocks: { index: number; text: string }[] = ebook?.blocksJson
    ? JSON.parse(ebook.blocksJson).blocks
    : [];

  const { placed, canPlace } = placeHighlights(
    highlights.map((h) => ({ text: h.text, note: h.note })),
    blocks,
    ebook?.syncMarks ?? [],
  );

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
          label: "From Kobo",
          note: (p.note ? `${p.text} — ${p.note}` : p.text).slice(0, 500),
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
