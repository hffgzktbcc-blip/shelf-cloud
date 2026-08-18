import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  defaultLibraryPath,
  findCalibreBook,
  libraryExists,
  listCalibreBooks,
  rankByTitle,
} from "@/lib/calibre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "";
  const matchTitle = url.searchParams.get("title");
  const matchAuthor = url.searchParams.get("author");

  if (!libraryExists()) {
    return NextResponse.json({ available: false, library: defaultLibraryPath(), books: [] });
  }

  try {
    const books = listCalibreBooks(query);

    // Surface likely matches for the book being viewed, but keep the full list browsable.
    const ordered = matchTitle
      ? rankByTitle(books, matchTitle, matchAuthor).map((r) => ({
          ...r.book,
          suggested: r.score >= 0.5,
        }))
      : books.map((b) => ({ ...b, suggested: false }));

    return NextResponse.json({
      available: true,
      library: defaultLibraryPath(),
      count: books.length,
      books: ordered.slice(0, 200).map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        sizeBytes: b.sizeBytes,
        hasCover: Boolean(b.coverPath),
        suggested: b.suggested,
      })),
    });
  } catch (e) {
    return NextResponse.json({ available: false, error: (e as Error).message, books: [] });
  }
}

const importSchema = z.object({ bookId: z.string(), calibreId: z.number().int() });

/** Copies the EPUB into the app's own storage — Calibre stays untouched. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { bookId, calibreId } = parsed.data;

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const source = findCalibreBook(calibreId);
  if (!source) return NextResponse.json({ error: "That Calibre book is no longer there" }, { status: 404 });

  const data = await fs.readFile(source.epubPath).catch(() => null);
  if (!data) return NextResponse.json({ error: "Could not read the EPUB from Calibre" }, { status: 422 });

  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const storedName = `${crypto.randomUUID()}.epub`;
  await fs.writeFile(path.join(STORAGE_DIR, storedName), data);

  const ebook = await prisma.ebook.create({
    data: {
      bookId,
      fileName: `${source.title}.epub`,
      filePath: storedName,
      format: "epub",
    },
  });

  return NextResponse.json({ ebook, importedFrom: source.title });
}
