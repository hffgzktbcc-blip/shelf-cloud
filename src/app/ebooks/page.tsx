import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { EbooksClient, type EbookRow } from "./ebooks-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ebooks — Shelf" };

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

export default async function EbooksPage() {
  const ebooks = await prisma.ebook.findMany({
    orderBy: { addedAt: "desc" },
    include: {
      book: {
        select: {
          id: true,
          title: true,
          author: true,
          parts: { orderBy: { order: "asc" }, select: { id: true, videoId: true, transcriptState: true } },
        },
      },
      syncMarks: { select: { blockIndex: true, partId: true } },
    },
  });

  const rows: EbookRow[] = await Promise.all(
    ebooks.map(async (e) => {
      let bytes: number | null = null;
      if (e.filePath) {
        bytes = await fs
          .stat(path.join(STORAGE_DIR, e.filePath))
          .then((s) => s.size)
          .catch(() => null);
      }

      const blocks = e.blocksJson
        ? ((JSON.parse(e.blocksJson).blocks ?? []) as unknown[]).length
        : 0;
      const aligned = e.syncMarks.filter((m) => m.blockIndex !== null);
      const indices = aligned.map((m) => m.blockIndex as number);

      // Coverage is the span of the book the marks actually reach, not the mark count —
      // an ebook can have hundreds of marks and still cover only one part of the novel.
      const coverage =
        blocks > 0 && indices.length > 1
          ? ((Math.max(...indices) - Math.min(...indices)) / blocks) * 100
          : 0;

      const partsWithTranscript = e.book.parts.filter((p) => p.transcriptState !== "none");

      return {
        id: e.id,
        fileName: e.fileName,
        bookId: e.book.id,
        bookTitle: e.book.title,
        bookAuthor: e.book.author,
        bytes,
        missing: e.filePath !== null && bytes === null,
        blocks,
        marks: aligned.length,
        coverage: Math.round(coverage),
        partsTotal: e.book.parts.length,
        partsAligned: new Set(aligned.map((m) => m.partId)).size,
        alignableParts: partsWithTranscript.map((p) => ({ id: p.id, videoId: p.videoId })),
      };
    }),
  );

  return <EbooksClient rows={rows} />;
}
