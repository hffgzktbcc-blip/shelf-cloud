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
      book: { select: { id: true, title: true, author: true } },
      syncMarks: { select: { blockIndex: true } },
    },
  });

  const rows: EbookRow[] = await Promise.all(
    ebooks.map(async (e) => {
      // The file can go missing if storage/ was cleared, so report size from disk, not the DB.
      let bytes: number | null = null;
      if (e.filePath) {
        bytes = await fs
          .stat(path.join(STORAGE_DIR, e.filePath))
          .then((s) => s.size)
          .catch(() => null);
      }

      const aligned = e.syncMarks.filter((m) => m.blockIndex !== null).length;
      const blocks = e.blocksJson
        ? ((JSON.parse(e.blocksJson).blocks ?? []) as unknown[]).length
        : 0;

      return {
        id: e.id,
        fileName: e.fileName,
        bookId: e.book.id,
        bookTitle: e.book.title,
        bookAuthor: e.book.author,
        addedAt: e.addedAt.toISOString(),
        bytes,
        missing: e.filePath !== null && bytes === null,
        blocks,
        marks: e.syncMarks.length,
        aligned,
      };
    }),
  );

  return <EbooksClient rows={rows} />;
}
