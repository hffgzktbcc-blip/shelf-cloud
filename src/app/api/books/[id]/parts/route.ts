import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { extractVideoId, fetchVideoMeta } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addSchema = z.object({ url: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const videoId = extractVideoId(parsed.data.url);
  if (!videoId) return NextResponse.json({ error: "Could not find a YouTube video ID." }, { status: 400 });

  const book = await prisma.book.findUnique({ where: { id }, include: { parts: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (book.parts.some((p) => p.videoId === videoId)) {
    return NextResponse.json({ error: "That part is already in this book." }, { status: 409 });
  }

  let meta;
  try {
    meta = await fetchVideoMeta(videoId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const part = await prisma.part.create({
    data: {
      bookId: id,
      videoId: meta.videoId,
      title: meta.title,
      order: book.parts.length,
      duration: meta.duration,
      thumbUrl: meta.thumbUrl,
      channel: meta.channel,
      chapters: {
        create: meta.chapters.map((c) => ({ title: c.title, startSec: c.startSec, order: c.order })),
      },
    },
    include: { chapters: { orderBy: { order: "asc" } } },
  });

  await prisma.book.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ part });
}

const reorderSchema = z.object({ order: z.array(z.string()) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "order array required" }, { status: 400 });

  await prisma.$transaction(
    parsed.data.order.map((partId, index) =>
      prisma.part.update({ where: { id: partId, bookId: id }, data: { order: index } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
