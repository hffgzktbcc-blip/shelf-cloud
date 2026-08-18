/**
 * Audiobook uploads title themselves like
 * "MOBY DICK by Herman Melville | FULL AudioBook 🎧 (Part 1/3)".
 * This pulls the useful pieces out so the library reads like a bookshelf.
 * The raw video title is always kept on the Part, so nothing here is lossy.
 */

export type ParsedTitle = {
  title: string;
  author: string | null;
  series: string | null;
  partNumber: number | null;
  partTotal: number | null;
  partLabel: string | null;
};

const NOISE = [
  "full audiobook",
  "full audio book",
  "complete audiobook",
  "audiobook",
  "audio book",
  "unabridged",
  "abridged",
  "readable text",
  "with readable text",
  "full length",
  "free audiobook",
  "reupload",
  "re-upload",
  "remastered",
  "hd audio",
  "high quality",
  "sleep audiobook",
  "bedtime story",
  "greatest audiobooks",
  "full novel",
  "complete",
  "full",
  "hd",
  "4k",
];

/** Genre/category tags sit where an author would, so they need excluding by name. */
const CATEGORY_WORDS = new Set([
  "sci fi", "science fiction", "scifi", "fantasy", "romance", "thriller", "mystery",
  "horror", "classic", "classics", "fiction", "non fiction", "nonfiction", "drama",
  "adventure", "novel", "story", "stories", "literature", "english literature",
  "self help", "biography", "history", "philosophy", "poetry", "young adult",
  "childrens", "kids", "bedtime", "sleep story", "detective", "crime", "western",
]);

const ROMAN = /^(?=[mdclxvi])m*(c[md]|d?c{0,3})(x[cl]|l?x{0,3})(i[xv]|v?i{0,3})$/i;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

function stripEmoji(s: string): string {
  return s.replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/gu, " ");
}

function tidySpacing(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|:,.·•*/]+/, "")
    .replace(/[\s\-–—|:,.·•*/]+$/, "")
    .trim();
}

function titleCaseIfShouty(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return s;
  const upper = (s.match(/[A-Z]/g) ?? []).length;
  if (upper / letters.length < 0.8) return s;

  const small = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "by"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function parsePartNumber(raw: string): number | null {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const word = NUMBER_WORDS[raw.toLowerCase()];
  if (word) return word;
  if (ROMAN.test(raw)) {
    const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    const s = raw.toLowerCase();
    let total = 0;
    for (let i = 0; i < s.length; i++) {
      const cur = map[s[i]];
      const next = map[s[i + 1]];
      total += next && cur < next ? -cur : cur;
    }
    return total > 0 ? total : null;
  }
  return null;
}

export function parseAudiobookTitle(rawTitle: string, channel?: string | null): ParsedTitle {
  let work = stripEmoji(rawTitle);

  let series: string | null = null;
  let partNumber: number | null = null;
  let partTotal: number | null = null;

  // Series markers usually sit in brackets: "[Red Rising Saga #6]", "(Discworld Book 3)"
  work = work.replace(/[[(]([^\])]*(?:#\d+|saga|series|cycle|trilogy|book\s*\d+)[^\])]*)[\])]/gi, (_, inner) => {
    if (!series) series = tidySpacing(String(inner));
    return " ";
  });

  // Longest alternatives first, or "vol" swallows the front of "volume".
  const UNIT = "volume|vol\\.?|parts?|pt\\.?|episode|ep\\.?|disc|cd|book";
  // Only real number forms — a bare \w+ here turns "Book of Mormon" into part 0.
  const NUM = `[0-9]{1,3}|[ivxlcdm]{1,7}|${Object.keys(NUMBER_WORDS).join("|")}`;

  // "Part 1 of 3", "Part 1/3", "Vol. 2", "Part Two of Five"
  const partOfRe = new RegExp(`\\b(?:${UNIT})\\s*(${NUM})\\s*(?:of|\\/)\\s*(${NUM})\\b`, "i");
  const partRe = new RegExp(`\\b(?:${UNIT})\\s*(${NUM})\\b`, "i");

  const ofMatch = work.match(partOfRe);
  if (ofMatch) {
    partNumber = parsePartNumber(ofMatch[1]);
    partTotal = parsePartNumber(ofMatch[2]);
    work = work.replace(ofMatch[0], " ");
  } else {
    const pMatch = work.match(partRe);
    if (pMatch) {
      const n = parsePartNumber(pMatch[1]);
      if (n !== null) {
        partNumber = n;
        work = work.replace(pMatch[0], " ");
      }
    }
  }

  // Bare "1/3" or "1 of 3" left over
  const bare = work.match(/\b(\d{1,2})\s*(?:of|\/)\s*(\d{1,2})\b/);
  if (bare && partNumber === null) {
    partNumber = Number(bare[1]);
    partTotal = Number(bare[2]);
    work = work.replace(bare[0], " ");
  }

  // Author: "<title> by <Author>" up to the next delimiter
  let author: string | null = null;
  const byMatch = work.match(/\bby\s+([^|\-–—[\]()/]+)/i);
  if (byMatch) {
    // The tail after the author is usually "… Full Audiobook Unabridged with Readable Text",
    // so scrub the boilerplate before judging whether what's left looks like a name.
    let candidate = byMatch[1];
    for (const phrase of NOISE) {
      candidate = candidate.replace(new RegExp(`\\b${phrase}\\b`, "ig"), "|");
    }
    candidate = tidySpacing(candidate.split("|")[0]).replace(/\b(with|and|read|narrated)\b.*$/i, "");
    candidate = tidySpacing(candidate);

    const words = candidate.split(" ").filter(Boolean);
    if (words.length > 0 && words.length <= 4) {
      author = titleCaseIfShouty(candidate);
      // Remove only "by <author>", leaving any trailing boilerplate for the noise pass.
      work = work.replace(new RegExp(`\\bby\\s+${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), " ");
    }
  }

  // Drop the channel name if the uploader stamped it into the title. Guard the length:
  // a short channel ("Y") would otherwise strip that letter out of every word.
  if (channel && channel.trim().length >= 4) {
    const safe = channel.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    work = work.replace(new RegExp(`\\b${safe}\\b`, "ig"), " ");
  }

  // Split on separators and keep the first segment that still has real words
  const segments = work
    .split(/[|•·]|\s[-–—]\s/)
    .map((s) => tidySpacing(s))
    .filter(Boolean);

  let title = segments[0] ?? tidySpacing(work);

  // Plenty of uploads write "Light Bringer - Pierce Brown" with no "by".
  // Take the first later segment that reads like a person's name, skipping genre tags.
  if (!author && segments.length > 1) {
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const words = seg.split(" ").filter(Boolean);
      const looksLikeName =
        words.length >= 2 &&
        words.length <= 3 &&
        words.every((w) => /^[A-Z][a-z'’.-]+$/.test(w)) &&
        !NOISE.some((n) => seg.toLowerCase().includes(n)) &&
        !CATEGORY_WORDS.has(seg.toLowerCase());
      if (looksLikeName) {
        author = seg;
        segments.splice(i, 1);
        break;
      }
    }
  }

  for (const phrase of NOISE) {
    title = title.replace(new RegExp(`\\b${phrase}\\b`, "ig"), " ");
  }
  // Scrubbing leaves debris: empty brackets and orphaned connector words.
  title = title.replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, " ");
  title = title.replace(/\s+(with|and|by|featuring|feat\.?|read|narrated|starring|in)\s*$/i, " ");
  title = tidySpacing(title);

  // If scrubbing ate the whole thing, fall back to something recognisable
  if (title.replace(/[^A-Za-z0-9]/g, "").length < 2) {
    title = tidySpacing(stripEmoji(rawTitle).split(/[|•·]/)[0]) || rawTitle;
  }

  title = titleCaseIfShouty(title);

  const partLabel =
    partNumber !== null
      ? partTotal
        ? `Part ${partNumber} of ${partTotal}`
        : `Part ${partNumber}`
      : null;

  return { title, author, series, partNumber, partTotal, partLabel };
}
