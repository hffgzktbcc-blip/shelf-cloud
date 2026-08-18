import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { extractVideoId, fetchVideoMeta } from "@/lib/youtube";
import { parseAudiobookTitle } from "@/lib/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ignores articles and punctuation, so "Pride & Prejudice" and "Pride and Prejudice" match. */
function titleKey(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const similarTo = new URL(req.url).searchParams.get("similarTo");

  // Books that look like the same work. A novel arriving as several uploads is the usual
  // way duplicates appear, so this powers the offer to combine them.
  if (similarTo) {
    const me = await prisma.book.findUnique({ where: { id: similarTo } });
    if (!me) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const others = await prisma.book.findMany({
      where: { id: { not: similarTo } },
      include: { parts: { orderBy: { order: "asc" }, select: { title: true } } },
    });

    const mine = titleKey(me.title);
    return NextResponse.json({
      similar: others
        .filter((b) => titleKey(b.title) === mine)
        .map((b) => ({
          id: b.id,
          title: b.title,
          author: b.author,
          partTitles: b.parts.map((p) => p.title),
        })),
    });
  }

  const books = await prisma.book.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      parts: { orderBy: { order: "asc" } },
      ebooks: true,
      _count: { select: { bookmarks: true } },
    },
  });
  return NextResponse.json({ books });
}

const createSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  author: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const videoId = extractVideoId(parsed.data.url);
  if (!videoId) {
    return NextResponse.json({ error: "Could not find a YouTube video ID in that link." }, { status: 400 });
  }

  const existing = await prisma.part.findFirst({ where: { videoId }, include: { book: true } });
  if (existing) {
    return NextResponse.json({ book: existing.book, duplicate: true });
  }

  let meta;
  try {
    meta = await fetchVideoMeta(videoId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const clean = parseAudiobookTitle(meta.title, meta.channel);

  const book = await prisma.book.create({
    data: {
      title: parsed.data.title?.trim() || clean.title,
      author: parsed.data.author?.trim() || clean.author || meta.channel,
      series: clean.series,
      description: meta.description.slice(0, 5000),
      coverUrl: meta.thumbUrl,
      narrator: meta.channel,
      parts: {
        create: {
          videoId: meta.videoId,
          title: meta.title,
          order: 0,
          duration: meta.duration,
          thumbUrl: meta.thumbUrl,
          channel: meta.channel,
          chapters: {
            create: meta.chapters.map((c) => ({
              title: c.title,
              startSec: c.startSec,
              order: c.order,
            })),
          },
        },
      },
    },
    include: { parts: { include: { chapters: true } } },
  });

  await prisma.book.update({
    where: { id: book.id },
    data: { lastPartId: book.parts[0]?.id },
  });

  return NextResponse.json({ book });
}
