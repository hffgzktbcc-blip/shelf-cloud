import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { findBookMetadata, type BookCandidate } from "@/lib/bookdata";
import { extractEpubCover } from "@/lib/epub-cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

/**
 * The EPUB already on disk is the best cover source there is: it's the exact edition,
 * it needs no network and no API key, and it cannot match the wrong book.
 */
async function fromLoadedEbook(bookId: string, title: string): Promise<BookCandidate[]> {
  const ebooks = await prisma.ebook.findMany({ where: { bookId } });
  const found: BookCandidate[] = [];

  for (const e of ebooks) {
    if (!e.filePath) continue;
    const cover = await extractEpubCover(path.join(STORAGE_DIR, e.filePath)).catch(() => null);
    if (!cover) continue;
    found.push({
      source: "epub",
      title,
      authors: [],
      year: null,
      coverUrl: `/api/ebooks/${e.id}/cover`,
      description: null,
      publisher: e.fileName,
      pageCount: null,
      // Always first: it is by definition the right edition.
      score: 1,
    });
  }

  return found;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bookId = url.searchParams.get("bookId");
  const override = url.searchParams.get("q");

  if (!bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  try {
    const googleKey = await prisma.setting.findUnique({ where: { key: "googleBooksApiKey" } });

    const [result, epub] = await Promise.all([
      findBookMetadata(
        override || book.title,
        override ? null : book.author,
        googleKey?.value ?? null,
      ),
      // A custom search means the user is deliberately looking elsewhere.
      override ? Promise.resolve([]) : fromLoadedEbook(bookId, book.title),
    ]);

    return NextResponse.json({ ...result, candidates: [...epub, ...result.candidates] });
  } catch (e) {
    return NextResponse.json(
      {
        error: (e as Error).message,
        candidates: [],
        sources: { openlibrary: "error", google: "error", apple: "error" },
      },
      { status: 502 },
    );
  }
}

const applySchema = z.object({
  bookId: z.string(),
  // Either an external cover URL or one of this app's own routes.
  coverUrl: z.union([z.string().url(), z.string().startsWith("/api/")]).optional(),
  author: z.string().optional(),
  description: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { bookId, coverUrl, author, description } = parsed.data;

  // The YouTube thumbnail stays on the Part, so replacing the book cover is reversible.
  const book = await prisma.book.update({
    where: { id: bookId },
    data: {
      ...(coverUrl ? { coverUrl } : {}),
      ...(author ? { author } : {}),
      ...(description ? { description: description.slice(0, 5000) } : {}),
    },
  });

  return NextResponse.json({ book });
}
