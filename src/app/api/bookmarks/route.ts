import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { quoteAt } from "@/lib/quote";
import type { TranscriptCue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bookId = url.searchParams.get("bookId");
  const bookmarks = await prisma.bookmark.findMany({
    where: bookId ? { bookId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { part: { select: { title: true, videoId: true, order: true } } },
  });
  return NextResponse.json({ bookmarks });
}

const createSchema = z.object({
  bookId: z.string(),
  partId: z.string(),
  timeSec: z.number().min(0),
  note: z.string().nullish(),
  label: z.string().nullish(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Capture what was being said, from the transcript already cached on the part — a
  // bookmark you can read beats a list of timestamps.
  let quote: string | null = null;
  const part = await prisma.part.findUnique({
    where: { id: parsed.data.partId },
    select: { transcriptJson: true },
  });
  if (part?.transcriptJson) {
    try {
      quote = quoteAt(JSON.parse(part.transcriptJson) as TranscriptCue[], parsed.data.timeSec);
    } catch {
      // A malformed cache shouldn't stop the bookmark being saved.
    }
  }

  const bookmark = await prisma.bookmark.create({ data: { ...parsed.data, quote } });
  return NextResponse.json({ bookmark });
}
