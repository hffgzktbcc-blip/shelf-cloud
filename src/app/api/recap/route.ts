import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fetchTranscript } from "@/lib/youtube";
import { extractiveRecap, lookback } from "@/lib/recap";
import type { TranscriptCue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_SEC = 300;

const bodySchema = z.object({
  partId: z.string(),
  timeSec: z.number().min(0),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { partId, timeSec } = parsed.data;

  const part = await prisma.part.findUnique({ where: { id: partId } });
  if (!part) return NextResponse.json({ error: "Part not found" }, { status: 404 });

  let cues: TranscriptCue[] = [];
  if (part.transcriptJson) cues = JSON.parse(part.transcriptJson);
  else {
    try {
      cues = await fetchTranscript(part.videoId);
      if (cues.length > 0) {
        await prisma.part.update({
          where: { id: part.id },
          data: { transcriptJson: JSON.stringify(cues), transcriptState: "ready" },
        });
      }
    } catch {
      cues = [];
    }
  }
  if (cues.length === 0) {
    return NextResponse.json(
      { error: "This recording has no transcript, so there's nothing to recap." },
      { status: 422 },
    );
  }

  const recent = lookback(cues, timeSec, RECENT_SEC);
  if (recent.length === 0) {
    return NextResponse.json(
      { error: "You're at the very start — nothing heard yet to recap." },
      { status: 422 },
    );
  }

  const answer = extractiveRecap(recent);
  if (!answer) {
    return NextResponse.json({ error: "Not enough narration to recap yet." }, { status: 422 });
  }
  return NextResponse.json({ answer, source: "extractive" });
}
