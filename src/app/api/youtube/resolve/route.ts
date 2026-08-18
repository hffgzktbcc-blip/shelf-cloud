import { NextResponse } from "next/server";
import { extractVideoId, fetchVideoMeta } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const input = url.searchParams.get("url") ?? "";
  const videoId = extractVideoId(input);
  if (!videoId) {
    return NextResponse.json({ error: "Could not find a YouTube video ID in that link." }, { status: 400 });
  }
  try {
    const meta = await fetchVideoMeta(videoId);
    return NextResponse.json(meta);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
