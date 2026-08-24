import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  blockAtPercentage,
  bindDocument,
  documentHashes,
  getBinding,
  listProgress,
  timeAtBlock,
  type ResolvedPosition,
} from "@/lib/kosync";
import { getEbook } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turns whatever KOReader pushed into something the player can act on: which book it was,
 * and where that lands on the audio timeline.
 */
export async function GET(req: Request) {
  const bookId = new URL(req.url).searchParams.get("bookId");

  const [progress, ebooks] = await Promise.all([
    listProgress(),
    prisma.ebook.findMany({
      include: {
        book: { select: { id: true, title: true } },
        syncMarks: { select: { blockIndex: true, timeSec: true, partId: true } },
      },
    }),
  ]);

  const alignedCount = (e: (typeof ebooks)[number]) =>
    e.syncMarks.filter((m) => m.blockIndex !== null).length;

  // One hash bucket per document, holding every ebook that could be it.
  //
  // Collisions are normal, not exceptional: the same novel split across several YouTube
  // uploads becomes several books, each with its own copy of the same EPUB and its own
  // slice of the alignment. Keeping all candidates lets the position pick the part that
  // actually covers it, instead of whichever row happened to be stored last.
  const byHash = new Map<string, (typeof ebooks)[number][]>();
  for (const e of ebooks) {
    if (!e.filePath) continue;
    const data = await getEbook(e.filePath);
    for (const h of documentHashes(data, e.fileName)) {
      const bucket = byHash.get(h);
      if (bucket) bucket.push(e);
      else byHash.set(h, [e]);
    }
  }

  const resolved: ResolvedPosition[] = [];

  for (const p of progress) {
    // An explicit binding always wins over hash matching.
    const boundId = await getBinding(p.document);
    const candidates = boundId
      ? ebooks.filter((e) => e.id === boundId)
      : (byHash.get(p.document) ?? []);

    const base = {
      document: p.document,
      label: p.label ?? null,
      device: p.device,
      percentage: p.percentage,
      updatedAt: p.timestamp,
    };

    if (candidates.length === 0) {
      resolved.push({
        ...base,
        bookId: null,
        bookTitle: null,
        timeSec: null,
        partId: null,
        blockIndex: null,
        coverage: "unknown",
      });
      continue;
    }

    // Score every candidate, then keep the one that resolves to a real timestamp.
    const scored = candidates.map((ebook) => {
      const blocks = ebook.blocksJson
        ? ((JSON.parse(ebook.blocksJson).blocks ?? []) as { index: number; text: string }[])
        : [];
      const blockIndex = blockAtPercentage(blocks, p.percentage);
      const at =
        blockIndex !== null
          ? timeAtBlock(blockIndex, ebook.syncMarks)
          : { coverage: "unaligned" as const };
      return { ebook, blockIndex, at };
    });

    const best =
      scored.find((c) => c.at.coverage === "ok") ??
      scored.sort((a, b) => alignedCount(b.ebook) - alignedCount(a.ebook))[0];

    resolved.push({
      ...base,
      bookId: best.ebook.book.id,
      bookTitle: best.ebook.book.title,
      blockIndex: best.blockIndex,
      timeSec: best.at.coverage === "ok" ? best.at.timeSec : null,
      partId: best.at.coverage === "ok" ? best.at.partId : null,
      coverage: best.at.coverage,
    });
  }

  // Unmatched syncs used to be invisible: the UI filters by book, so a position that
  // matched nothing could never be seen or corrected. They are returned alongside now,
  // with the ebook this book could bind them to.
  const bindableEbookId = bookId ? (ebooks.find((e) => e.bookId === bookId)?.id ?? null) : null;

  return NextResponse.json({
    positions: bookId ? resolved.filter((r) => r.bookId === bookId) : resolved,
    unmatched: resolved.filter((r) => r.bookId === null),
    bindableEbookId,
    // Everything an unmatched sync could be linked to, so the page can offer a choice
    // rather than sending you elsewhere to make it.
    linkable: ebooks.map((e) => ({
      ebookId: e.id,
      bookId: e.book.id,
      bookTitle: e.book.title,
      fileName: e.fileName,
    })),
  });
}

const bindSchema = z.object({ document: z.string(), ebookId: z.string() });

export async function POST(req: Request) {
  const parsed = bindSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await bindDocument(parsed.data.document, parsed.data.ebookId);
  return NextResponse.json({ ok: true });
}
