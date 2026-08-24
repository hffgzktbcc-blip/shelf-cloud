import { parseEpub } from "@/lib/epub-parse";
import { getEbook } from "@/lib/storage";

/**
 * Re-parsing a whole EPUB on every sync tick would be wasteful, so the per-block href list
 * is cached per ebook. Ebook files are immutable after upload (a re-upload always gets a
 * fresh key, never overwrites), so the cache needs no invalidation check.
 */
const cache = new Map<string, string[]>();

async function hrefsForEbook(ebookId: string, filePath: string): Promise<string[] | null> {
  const cached = cache.get(ebookId);
  if (cached) return cached;

  const data = await getEbook(filePath);
  if (!data) return null;

  const parsed = await parseEpub(data);
  const hrefs = parsed.blocks.map((b) => b.href);
  cache.set(ebookId, hrefs);
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
