import type { TranscriptCue } from "@/lib/types";

/**
 * The words being narrated at a given moment, so a bookmark reads as a passage rather than
 * a timestamp. Cues are only a few words each, so a useful quote spans several of them.
 */

/** A little before, because you press the button after hearing the line worth keeping. */
const LEAD_SEC = 5;
const TRAIL_SEC = 10;
const MAX_CHARS = 220;

export function quoteAt(cues: TranscriptCue[], timeSec: number): string | null {
  if (cues.length === 0) return null;

  const from = timeSec - LEAD_SEC;
  const to = timeSec + TRAIL_SEC;

  const window = cues.filter((c) => c.start + (c.dur ?? 0) >= from && c.start <= to);
  if (window.length === 0) return null;

  const text = window
    .map((c) => c.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  return tidy(text);
}

/**
 * Captions rarely start or end on a sentence. Prefer a clean sentence boundary when one is
 * close by, and otherwise cut on a word so the quote never ends mid-syllable.
 */
function tidy(text: string): string {
  let out = text;

  // Drop a leading sentence fragment when a full sentence starts soon after.
  const firstBreak = out.search(/[.!?]["')\]]?\s+/);
  if (firstBreak > 0 && firstBreak < 60) {
    out = out.slice(firstBreak).replace(/^[.!?"')\]\s]+/, "");
  }

  if (out.length <= MAX_CHARS) return finishSentence(out);

  const clipped = out.slice(0, MAX_CHARS);
  const lastStop = clipped.search(/[.!?]["')\]]?[^.!?]*$/);
  if (lastStop > MAX_CHARS * 0.5) return clipped.slice(0, lastStop + 1).trim();

  return clipped.slice(0, clipped.lastIndexOf(" ")).trim() + "…";
}

function finishSentence(text: string): string {
  return /[.!?]["')\]]?$/.test(text) ? text : text + "…";
}
