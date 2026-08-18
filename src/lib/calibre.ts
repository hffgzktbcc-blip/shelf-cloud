import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Reads a Calibre library's catalogue. Strictly read-only — the library is the user's own
 * and Calibre may have it open, so we never write to metadata.db.
 */

export type CalibreBook = {
  id: number;
  title: string;
  author: string | null;
  /** Absolute path to the EPUB on disk. */
  epubPath: string;
  /** Absolute path to Calibre's cover, if it has one. */
  coverPath: string | null;
  sizeBytes: number;
};

export function defaultLibraryPath(): string {
  return process.env.CALIBRE_LIBRARY ?? path.join(os.homedir(), "Calibre Library");
}

export function libraryExists(libPath = defaultLibraryPath()): boolean {
  return fs.existsSync(path.join(libPath, "metadata.db"));
}

export function listCalibreBooks(query = "", libPath = defaultLibraryPath()): CalibreBook[] {
  const dbFile = path.join(libPath, "metadata.db");
  if (!fs.existsSync(dbFile)) return [];

  // readonly + immutable so an open Calibre can't block us and we can't corrupt it.
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT b.id, b.title, b.path, b.has_cover, d.name AS fileName, d.uncompressed_size AS size,
                (SELECT GROUP_CONCAT(a.name, ', ')
                   FROM books_authors_link bal JOIN authors a ON a.id = bal.author
                  WHERE bal.book = b.id) AS author
           FROM books b
           JOIN data d ON d.book = b.id AND d.format = 'EPUB'
          ORDER BY b.sort COLLATE NOCASE`,
      )
      .all() as {
      id: number;
      title: string;
      path: string;
      has_cover: number;
      fileName: string;
      size: number | null;
      author: string | null;
    }[];

    const q = query.trim().toLowerCase();

    return rows
      .map((r) => {
        const dir = path.join(libPath, r.path);
        const epubPath = path.join(dir, `${r.fileName}.epub`);
        const cover = path.join(dir, "cover.jpg");
        return {
          id: r.id,
          title: r.title,
          author: r.author,
          epubPath,
          coverPath: r.has_cover && fs.existsSync(cover) ? cover : null,
          sizeBytes: r.size ?? 0,
        };
      })
      // A row can outlive its file if the library was moved or partly synced.
      .filter((b) => fs.existsSync(b.epubPath))
      .filter(
        (b) =>
          !q ||
          b.title.toLowerCase().includes(q) ||
          (b.author ?? "").toLowerCase().includes(q),
      );
  } finally {
    db.close();
  }
}

export function findCalibreBook(id: number, libPath = defaultLibraryPath()): CalibreBook | null {
  return listCalibreBooks("", libPath).find((b) => b.id === id) ?? null;
}

/** Rough title match, so the right ebook floats to the top for the book you're on. */
export function rankByTitle(books: CalibreBook[], title: string, author?: string | null) {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const t = new Set(norm(title).split(" ").filter((w) => w.length > 2));
  const a = norm(author ?? "");

  return [...books]
    .map((b) => {
      const bt = new Set(norm(b.title).split(" ").filter((w) => w.length > 2));
      let overlap = 0;
      for (const w of t) if (bt.has(w)) overlap++;
      const denom = Math.max(1, Math.min(t.size, bt.size));
      let score = overlap / denom;
      if (a && b.author && norm(b.author).includes(a.split(" ").pop() ?? "")) score += 0.25;
      return { book: b, score };
    })
    .sort((x, y) => y.score - x.score);
}
