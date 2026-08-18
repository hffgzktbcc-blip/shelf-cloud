/**
 * Parses Kindle highlight exports.
 *
 * Two shapes are supported: the `My Clippings.txt` file a Kindle device writes, and the
 * text you get from copying a book's page on read.amazon.com/notebook. Both are the user's
 * own annotations — nothing here touches protected book files.
 */

export type KindleHighlight = {
  /** The highlighted passage. */
  text: string;
  /** Kindle location, when the export includes one. */
  location: number | null;
  page: number | null;
  note: string | null;
  bookTitle: string | null;
  bookAuthor: string | null;
};

const SEPARATOR = /^=+$/;

/** `Title (Author)` or `Title - Author` on a clipping's first line. */
function splitTitleAuthor(line: string): { title: string; author: string | null } {
  const paren = line.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) return { title: paren[1].trim(), author: paren[2].trim() };
  const dash = line.match(/^(.*?)\s+-\s+(.+)$/);
  if (dash) return { title: dash[1].trim(), author: dash[2].trim() };
  return { title: line.trim(), author: null };
}

function parseClippings(raw: string): KindleHighlight[] {
  const out: KindleHighlight[] = [];
  const entries = raw.split(/\r?\n/).reduce<string[][]>(
    (acc, line) => {
      if (SEPARATOR.test(line.trim())) acc.push([]);
      else acc[acc.length - 1].push(line);
      return acc;
    },
    [[]],
  );

  for (const entry of entries) {
    const lines = entry.map((l) => l.trim()).filter((l, i) => l.length > 0 || i > 0);
    if (lines.length < 2) continue;

    const { title, author } = splitTitleAuthor(lines[0]);
    const meta = lines[1] ?? "";

    // Notes and bookmarks come through the same file; only highlights carry passages.
    const isNote = /your note/i.test(meta);
    const isBookmark = /your bookmark/i.test(meta);
    if (isBookmark) continue;

    const loc = meta.match(/location\s+(\d+)/i);
    const page = meta.match(/page\s+(\d+)/i);

    const body = lines.slice(2).join(" ").replace(/\s+/g, " ").trim();
    if (!body) continue;

    out.push({
      text: isNote ? "" : body,
      note: isNote ? body : null,
      location: loc ? Number(loc[1]) : null,
      page: page ? Number(page[1]) : null,
      bookTitle: title || null,
      bookAuthor: author,
    });
  }

  return out.filter((h) => h.text.length > 0);
}

/** Pasted notebook text: a "Location: N" style line followed by the passage. */
function parseNotebook(raw: string): KindleHighlight[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const out: KindleHighlight[] = [];

  for (let i = 0; i < lines.length; i++) {
    const meta = lines[i];
    if (!/highlight|location|page/i.test(meta)) continue;
    if (meta.length > 120) continue; // a passage, not a metadata line

    const loc = meta.match(/location[:\s]+(\d+)/i);
    const page = meta.match(/page[:\s]+(\d+)/i);
    if (!loc && !page) continue;

    // Take the following non-empty, non-metadata lines as the passage.
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l) {
        if (body.length) break;
        continue;
      }
      if (/^(yellow|blue|pink|orange)?\s*highlight/i.test(l) || /^note[:\s]/i.test(l)) break;
      body.push(l);
      if (body.join(" ").length > 1200) break;
    }

    const text = body.join(" ").replace(/\s+/g, " ").trim();
    if (text.length < 12) continue;

    out.push({
      text,
      note: null,
      location: loc ? Number(loc[1]) : null,
      page: page ? Number(page[1]) : null,
      bookTitle: null,
      bookAuthor: null,
    });
  }

  return out;
}

export function parseKindleExport(raw: string): KindleHighlight[] {
  const looksLikeClippings = /={5,}/.test(raw) && /your (highlight|note|bookmark)/i.test(raw);
  const parsed = looksLikeClippings ? parseClippings(raw) : parseNotebook(raw);

  // Kindle repeats a highlight each time it's edited; keep the longest of each.
  const byKey = new Map<string, KindleHighlight>();
  for (const h of parsed) {
    const key = h.text.slice(0, 60).toLowerCase();
    const prev = byKey.get(key);
    if (!prev || h.text.length > prev.text.length) byKey.set(key, h);
  }
  return [...byKey.values()];
}

/**
 * Finds where a highlight sits in the book's own text, so it can be placed on the audio
 * timeline. Matches on a distinctive run of words rather than exact string equality —
 * Kindle's copy differs from the EPUB's in whitespace and punctuation.
 */
export function locateInBlocks(
  highlight: string,
  blocks: { index: number; text: string }[],
): number | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const needle = norm(highlight);
  if (needle.length < 12) return null;

  const words = needle.split(" ");
  const probe = words.slice(0, 8).join(" ");

  for (const b of blocks) {
    const hay = norm(b.text);
    if (hay.includes(probe) || (needle.length < hay.length && hay.includes(needle))) {
      return b.index;
    }
  }

  // Fall back to the block sharing the most rare-ish words with the highlight.
  let best = -1;
  let bestScore = 0;
  const wanted = new Set(words.filter((w) => w.length > 4));
  if (wanted.size < 3) return null;

  for (const b of blocks) {
    const hay = new Set(norm(b.text).split(" "));
    let score = 0;
    for (const w of wanted) if (hay.has(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = b.index;
    }
  }
  return bestScore >= Math.max(3, wanted.size * 0.6) ? best : null;
}
