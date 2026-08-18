import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fetchTranscript } from "@/lib/youtube";
import { buildPrompt, extractiveRecap, lookback } from "@/lib/recap";
import type { TranscriptCue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const RECENT_SEC = 300;
const EARLIER_SEC = 1800;

const bodySchema = z.object({
  partId: z.string(),
  timeSec: z.number().min(0),
  question: z.string().min(1).max(1000),
  model: z.string().optional(),
});

/** Reports whether a local model is available, so the UI can say so honestly. */
export async function GET() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return NextResponse.json({ ollama: false, models: [] });
    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
    return NextResponse.json({ ollama: models.length > 0, models });
  } catch {
    return NextResponse.json({ ollama: false, models: [] });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { partId, timeSec, question, model } = parsed.data;

  const part = await prisma.part.findUnique({
    where: { id: partId },
    include: { book: true, chapters: { orderBy: { order: "asc" } } },
  });
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
  const earlier = lookback(cues, Math.max(0, timeSec - RECENT_SEC), EARLIER_SEC);
  if (recent.length === 0) {
    return NextResponse.json(
      { error: "You're at the very start — nothing heard yet to recap." },
      { status: 422 },
    );
  }

  const chapter = [...part.chapters].reverse().find((c) => c.startSec <= timeSec) ?? null;
  const { system, prompt } = buildPrompt({
    bookTitle: part.book.title,
    author: part.book.author,
    chapterTitle: chapter?.title ?? null,
    now: timeSec,
    recent,
    earlier,
    question,
  });

  // Try the local model; fall back to the extractive recap so the feature always answers.
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: model ?? "llama3.2:3b",
        system,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_ctx: 8192 },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const answer = String(data.response ?? "").trim();
      if (answer) {
        return NextResponse.json({ answer, source: "ollama", model: data.model ?? model });
      }
    }
  } catch {
    // Ollama not running, model missing, or timed out — fall through.
  }

  const answer = extractiveRecap(recent);
  if (!answer) {
    return NextResponse.json({ error: "Not enough narration to recap yet." }, { status: 422 });
  }
  return NextResponse.json({ answer, source: "extractive" });
}
