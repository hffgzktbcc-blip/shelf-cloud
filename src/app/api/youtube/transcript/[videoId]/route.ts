import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchTranscript } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await ctx.params;
  if (!/^[\w-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  const part = await prisma.part.findFirst({ where: { videoId } });
  if (part?.transcriptJson) {
    return NextResponse.json({ cues: JSON.parse(part.transcriptJson), cached: true });
  }
  if (part?.transcriptState === "unavailable") {
    return NextResponse.json({ cues: [], unavailable: true, cached: true });
  }

  try {
    const cues = await fetchTranscript(videoId);
    if (part) {
      await prisma.part.update({
        where: { id: part.id },
        data: {
          transcriptJson: cues.length > 0 ? JSON.stringify(cues) : null,
          transcriptState: cues.length > 0 ? "ready" : "unavailable",
        },
      });
    }
    return NextResponse.json({ cues, unavailable: cues.length === 0 });
  } catch (e) {
    if (part) {
      await prisma.part.update({
        where: { id: part.id },
        data: { transcriptState: "unavailable" },
      });
    }
    return NextResponse.json({ cues: [], unavailable: true, error: (e as Error).message });
  }
}
