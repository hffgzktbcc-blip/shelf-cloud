import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Reads annotations from a connected Kobo eReader.
 *
 * A Kobo mounts as ordinary USB storage and keeps its own SQLite database at
 * `.kobo/KoboReader.sqlite`, so unlike Kindle there is nothing to copy and paste — the
 * highlights can be read directly. Strictly read-only; the device's database is never
 * written to.
 */

export type KoboDevice = { volume: string; dbPath: string };

export type KoboBook = {
  contentId: string;
  title: string;
  author: string | null;
  highlightCount: number;
};

export type KoboHighlight = {
  text: string;
  note: string | null;
  bookTitle: string | null;
  bookAuthor: string | null;
  createdAt: string | null;
};

export function findKoboDevices(): KoboDevice[] {
  const out: KoboDevice[] = [];
  let volumes: string[] = [];
  try {
    volumes = fs.readdirSync("/Volumes");
  } catch {
    return out;
  }

  for (const name of volumes) {
    const dbPath = path.join("/Volumes", name, ".kobo", "KoboReader.sqlite");
    if (fs.existsSync(dbPath)) out.push({ volume: path.join("/Volumes", name), dbPath });
  }
  return out;
}

/** Opens the device database read-only so a mid-read disconnect can't corrupt it. */
function openDb(dbPath: string) {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

/**
 * Kobo's schema has drifted across firmware versions, so the queries below select only
 * long-standing columns and tolerate a missing `Type` column.
 */
export function listKoboBooks(dbPath: string): KoboBook[] {
  const db = openDb(dbPath);
  try {
    const hasType = db
      .prepare("SELECT COUNT(*) c FROM pragma_table_info('Bookmark') WHERE name='Type'")
      .get() as { c: number };

    const typeFilter = hasType.c > 0 ? "AND (b.Type IS NULL OR b.Type != 'dogear')" : "";

    return db
      .prepare(
        `SELECT c.ContentID AS contentId,
                COALESCE(NULLIF(c.BookTitle,''), c.Title) AS title,
                c.Attribution AS author,
                COUNT(b.BookmarkID) AS highlightCount
           FROM Bookmark b
           JOIN content c ON c.ContentID = b.VolumeID
          WHERE b.Text IS NOT NULL AND TRIM(b.Text) != '' ${typeFilter}
          GROUP BY c.ContentID
          ORDER BY highlightCount DESC`,
      )
      .all() as KoboBook[];
  } finally {
    db.close();
  }
}

export function readKoboHighlights(dbPath: string, contentId?: string): KoboHighlight[] {
  const db = openDb(dbPath);
  try {
    const hasType = db
      .prepare("SELECT COUNT(*) c FROM pragma_table_info('Bookmark') WHERE name='Type'")
      .get() as { c: number };
    const typeFilter = hasType.c > 0 ? "AND (b.Type IS NULL OR b.Type != 'dogear')" : "";
    const bookFilter = contentId ? "AND b.VolumeID = @contentId" : "";

    const rows = db
      .prepare(
        `SELECT b.Text AS text,
                b.Annotation AS note,
                b.DateCreated AS createdAt,
                COALESCE(NULLIF(c.BookTitle,''), c.Title) AS bookTitle,
                c.Attribution AS bookAuthor
           FROM Bookmark b
           LEFT JOIN content c ON c.ContentID = b.VolumeID
          WHERE b.Text IS NOT NULL AND TRIM(b.Text) != '' ${typeFilter} ${bookFilter}
          ORDER BY b.DateCreated`,
      )
      .all(contentId ? { contentId } : {}) as KoboHighlight[];

    return rows
      .map((r) => ({
        ...r,
        text: (r.text ?? "").replace(/\s+/g, " ").trim(),
        note: r.note ? String(r.note).replace(/\s+/g, " ").trim() || null : null,
      }))
      .filter((r) => r.text.length > 0);
  } finally {
    db.close();
  }
}

/** Sideloaded EPUBs sit as ordinary files on the device and can be imported like Calibre's. */
export function listKoboEpubs(volume: string): { name: string; fullPath: string; sizeBytes: number }[] {
  const out: { name: string; fullPath: string; sizeBytes: number }[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > 3 || out.length > 500) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue; // .kobo, .adobe-digital-editions
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".epub")) {
        try {
          out.push({ name: e.name, fullPath: full, sizeBytes: fs.statSync(full).size });
        } catch {
          /* unreadable file — skip */
        }
      }
    }
  };

  walk(volume, 0);
  return out;
}
