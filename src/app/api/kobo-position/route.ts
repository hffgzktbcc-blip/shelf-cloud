import path from "node:path";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

/**
 * Turns whatever KOReader pushed into something the player can act on: which book it was,
 * and where that lands on the audio timeline.
 */
export async function GET(req: Request) {
  const bookId = new URL(req.url).searchParams.get("bookId");

  const [progress, ebooks] = await Promise.all([
    listProgress(),
    prisma.ebook.findMany({ include: { book: { select: { id: true, title: true } } } }),
  ]);

  // One hash lookup table for every ebook on disk.
  const byHash = new Map<string, (typeof ebooks)[number]>();
  for (const e of ebooks) {
    if (!e.filePath) continue;
    for (const h of documentHashes(path.join(STORAGE_DIR, e.filePath), e.fileName)) {
      byHash.set(h, e);
    }
  }

  const resolved: ResolvedPosition[] = [];

  for (const p of progress) {
    // An explicit binding always wins over hash matching.
    const boundId = await getBinding(p.document);
    const ebook = boundId ? ebooks.find((e) => e.id === boundId) : byHash.get(p.document);

    const base = {
      document: p.document,
      device: p.device,
      percentage: p.percentage,
      updatedAt: p.timestamp,
    };

    if (!ebook) {
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

    const blocks = ebook.blocksJson
      ? ((JSON.parse(ebook.blocksJson).blocks ?? []) as { index: number; text: string }[])
      : [];
    const blockIndex = blockAtPercentage(blocks, p.percentage);

    const marks = await prisma.syncMark.findMany({ where: { ebookId: ebook.id } });
    const at = blockIndex !== null ? timeAtBlock(blockIndex, marks) : { coverage: "unaligned" as const };

    resolved.push({
      ...base,
      bookId: ebook.book.id,
      bookTitle: ebook.book.title,
      blockIndex,
      timeSec: at.coverage === "ok" ? at.timeSec : null,
      partId: at.coverage === "ok" ? at.partId : null,
      coverage: at.coverage,
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
  });
}

const bindSchema = z.object({ document: z.string(), ebookId: z.string() });

export async function POST(req: Request) {
  const parsed = bindSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await bindDocument(parsed.data.document, parsed.data.ebookId);
  return NextResponse.json({ ok: true });
}
