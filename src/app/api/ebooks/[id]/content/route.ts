import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseEpub } from "@/lib/epub-parse";
import { getEbook } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Parses on first request and caches on the row — reparsing 7,600 blocks per open is wasteful. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  const ebook = await prisma.ebook.findUnique({ where: { id } });
  if (!ebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ebook.blocksJson && !refresh) {
    return NextResponse.json({
      ...JSON.parse(ebook.blocksJson),
      blockIndex: ebook.blockIndex ?? 0,
      cached: true,
    });
  }

  const file = await getEbook(ebook.filePath);
  if (!file) return NextResponse.json({ error: "File missing on disk" }, { status: 404 });

  try {
    const parsed = await parseEpub(file);
    await prisma.ebook.update({
      where: { id },
      data: { blocksJson: JSON.stringify(parsed) },
    });
    return NextResponse.json({ ...parsed, blockIndex: ebook.blockIndex ?? 0, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
