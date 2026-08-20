import fs from "node:fs";
import path from "node:path";
import { parseEpub } from "@/lib/epub-parse";

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

/**
 * Re-parsing a whole EPUB on every sync tick would be wasteful, so the per-block href list
 * is cached per ebook and only recomputed if the file has changed since.
 */
const cache = new Map<string, { mtimeMs: number; hrefs: string[] }>();

async function hrefsForEbook(ebookId: string, filePath: string): Promise<string[] | null> {
  const full = path.join(STORAGE_DIR, filePath);
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(full).mtimeMs;
  } catch {
    return null;
  }

  const cached = cache.get(ebookId);
  if (cached && cached.mtimeMs === mtimeMs) return cached.hrefs;

  const parsed = await parseEpub(fs.readFileSync(full));
  const hrefs = parsed.blocks.map((b) => b.href);
  cache.set(ebookId, { mtimeMs, hrefs });
  return hrefs;
}

/**
 * The epub-internal chapter file a given block index falls in, formatted as a Kobo
 * `ChapterIDBookmarked` value so a stock Kobo's own reader jumps there — not just the
 * cosmetic `___PercentRead` figure, which its reader otherwise overwrites on open.
 *
 * Chapter-level only: this points at the start of the right file, not an exact paragraph.
 */
export async function chapterHrefForBlock(
  ebookId: string,
  filePath: string,
  blockIndex: number,
): Promise<string | null> {
  const hrefs = await hrefsForEbook(ebookId, filePath);
  if (!hrefs || hrefs.length === 0) return null;
  const clamped = Math.max(0, Math.min(blockIndex, hrefs.length - 1));
  const href = hrefs[clamped];
  return href ? `${href}#kobo.1.1` : null;
}
