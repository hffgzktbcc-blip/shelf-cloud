import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { quoteAt } from "@/lib/quote";
import type { TranscriptCue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fills in quotes for bookmarks saved before they captured any text. Only touches rows that
 * have none, so it is safe to run more than once and never overwrites your own edits.
 */
export async function POST() {
  const bookmarks = await prisma.bookmark.findMany({ where: { quote: null } });
  const parts = new Map<string, TranscriptCue[] | null>();

  let filled = 0;
  let noTranscript = 0;

  for (const b of bookmarks) {
    if (!parts.has(b.partId)) {
      const part = await prisma.part.findUnique({
        where: { id: b.partId },
        select: { transcriptJson: true },
      });
      let cues: TranscriptCue[] | null = null;
      if (part?.transcriptJson) {
        try {
          cues = JSON.parse(part.transcriptJson) as TranscriptCue[];
        } catch {
          cues = null;
        }
      }
      parts.set(b.partId, cues);
    }

    const cues = parts.get(b.partId);
    if (!cues) {
      noTranscript++;
      continue;
    }

    const quote = quoteAt(cues, b.timeSec);
    if (!quote) continue;

    await prisma.bookmark.update({ where: { id: b.id }, data: { quote } });
    filled++;
  }

  return NextResponse.json({ considered: bookmarks.length, filled, noTranscript });
}
