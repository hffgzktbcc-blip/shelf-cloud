/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TranscriptCue } from "@/lib/types";

/**
 * Aligns a narration transcript to the book's own text so "Follow audio" works across a
 * whole book instead of only at hand-placed anchors.
 *
 * The transcript is an imperfect machine reading (mangled names, dropped words), so this
 * matches on shared 4-grams and votes, rather than expecting exact text. Alignment is
 * forced forward through the book, which is what keeps a repeated phrase from throwing
 * the reader back to an earlier chapter.
 */

/**
 * Positions are returned as block indices, not CFIs. CFIs built from a detached copy of a
 * section don't line up with the child offsets epub.js renders, which makes it throw when
 * it tries to display them. The caller converts these to CFIs via epub.js's own
 * locations.cfiFromPercentage, which always resolves.
 */
export type AlignedPoint = { timeSec: number; blockIndex: number };

export type AlignProgress = {
  phase: "reading-book" | "matching" | "saving";
  done: number;
  total: number;
};

export type Block = { chars: number; tokens: string[] };

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with",
  "was", "were", "is", "are", "be", "been", "it", "its", "he", "she", "they", "him",
  "her", "them", "his", "their", "that", "this", "as", "had", "have", "has", "i",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function gramsOf(tokens: string[], n = 4): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}

/** Pulls every text block out of the EPUB with a CFI pointing at it. */
export async function readBookBlocks(
  book: any,
  onProgress?: (done: number, total: number) => void,
): Promise<Block[]> {
  await book.ready;

  const sections: any[] = [];
  book.spine.each((s: any) => sections.push(s));

  const blocks: Block[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    try {
      const doc: any = await section.load(book.load.bind(book));
      const root: Document | Element = doc?.documentElement ? doc : doc;
      const nodes = (root as any).querySelectorAll?.("p, h1, h2, h3, h4, blockquote, li");

      if (nodes) {
        for (const el of Array.from(nodes) as Element[]) {
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (text.length < 25) continue;
          const tokens = tokenize(text);
          if (tokens.length < 6) continue;
          blocks.push({ chars: text.length, tokens });
        }
      }
    } catch {
      // A section that won't parse just contributes nothing.
    } finally {
      try {
        section.unload();
      } catch {
        /* ignore */
      }
    }
    onProgress?.(i + 1, sections.length);
  }

  return blocks;
}

/**
 * Maps 4-grams to the blocks they appear in. Grams that turn up all over the book carry
 * no positional information, so they are dropped rather than allowed to add noise.
 */
function buildIndex(blocks: Block[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  blocks.forEach((block, blockIdx) => {
    for (const gram of new Set(gramsOf(block.tokens))) {
      const list = index.get(gram);
      if (list) list.push(blockIdx);
      else index.set(gram, [blockIdx]);
    }
  });
  for (const [gram, list] of index) {
    if (list.length > 12) index.delete(gram);
  }
  return index;
}

export type AlignOptions = {
  /** Seconds between anchor attempts. */
  intervalSec?: number;
  /** Words of narration used per anchor. */
  windowWords?: number;
  /** Minimum 4-gram votes before a match is trusted. */
  minVotes?: number;
};

export function alignTranscriptToBook(
  cues: TranscriptCue[],
  blocks: Block[],
  opts: AlignOptions = {},
): AlignedPoint[] {
  const intervalSec = opts.intervalSec ?? 90;
  const windowWords = opts.windowWords ?? 28;
  const minVotes = opts.minVotes ?? 2;

  if (blocks.length === 0 || cues.length === 0) return [];

  const index = buildIndex(blocks);
  const marks: AlignedPoint[] = [];

  let cursor = 0; // never match earlier than this block
  let nextAnchorAt = cues[0].start;

  for (let i = 0; i < cues.length; i++) {
    if (cues[i].start < nextAnchorAt) continue;

    // Gather roughly windowWords of narration from here.
    const words: string[] = [];
    let j = i;
    while (j < cues.length && words.length < windowWords) {
      words.push(...tokenize(cues[j].text));
      j++;
    }
    if (words.length < 8) continue;

    const votes = new Map<number, number>();
    for (const gram of new Set(gramsOf(words))) {
      const hits = index.get(gram);
      if (!hits) continue;
      for (const blockIdx of hits) {
        if (blockIdx < cursor) continue;
        // Prefer nearby blocks; a match 500 blocks ahead is usually a coincidence.
        const distance = blockIdx - cursor;
        const weight = distance > 40 ? 0.5 : 1;
        votes.set(blockIdx, (votes.get(blockIdx) ?? 0) + weight);
      }
    }

    let bestIdx = -1;
    let bestScore = 0;
    for (const [blockIdx, score] of votes) {
      if (score > bestScore || (score === bestScore && blockIdx < bestIdx)) {
        bestScore = score;
        bestIdx = blockIdx;
      }
    }

    nextAnchorAt = cues[i].start + intervalSec;

    if (bestIdx < 0 || bestScore < minVotes) continue;

    // Content words only, so a run of stopwords can't fake a match.
    const contentWords = words.filter((w) => !STOP.has(w));
    if (contentWords.length < 5) continue;

    marks.push({ timeSec: cues[i].start, blockIndex: bestIdx });
    cursor = bestIdx;
  }

  return marks;
}

/**
 * Fraction through the book's text at the start of each block, weighted by characters so it
 * lines up with epub.js's character-based locations.
 */
export function blockPercentages(blocks: Block[]): number[] {
  const total = blocks.reduce((sum, b) => sum + b.chars, 0) || 1;
  const out: number[] = [];
  let running = 0;
  for (const b of blocks) {
    out.push(running / total);
    running += b.chars;
  }
  return out;
}
