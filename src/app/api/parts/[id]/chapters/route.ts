import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchTranscript } from "@/lib/youtube";
import { detectChaptersFromTranscript } from "@/lib/chapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const part = await prisma.part.findUnique({
    where: { id },
    include: { chapters: true },
  });
  if (!part) return NextResponse.json({ error: "Part not found" }, { status: 404 });

  let cues;
  if (part.transcriptJson) {
    cues = JSON.parse(part.transcriptJson);
  } else {
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

  if (!cues || cues.length === 0) {
    return NextResponse.json(
      { error: "This video has no transcript, so chapters can't be detected from it." },
      { status: 422 },
    );
  }

  const detected = detectChaptersFromTranscript(cues, part.duration);
  if (detected.length < 2) {
    return NextResponse.json(
      { error: "Couldn't hear any chapter announcements in this recording." },
      { status: 422 },
    );
  }

  const previous = part.chapters.length;

  await prisma.$transaction([
    prisma.chapter.deleteMany({ where: { partId: part.id } }),
    prisma.chapter.createMany({
      data: detected.map((c) => ({
        partId: part.id,
        title: c.title,
        startSec: c.startSec,
        order: c.order,
      })),
    }),
  ]);

  const chapters = await prisma.chapter.findMany({
    where: { partId: part.id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ chapters, replaced: previous, found: detected.length });
}
