import type { TranscriptCue } from "@/lib/youtube";

export type DetectedChapter = { title: string; startSec: number; order: number };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const ROMAN_MAP: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanToInt(s: string): number | null {
  const lower = s.toLowerCase();
  if (!/^[mdclxvi]+$/.test(lower)) return null;
  let total = 0;
  for (let i = 0; i < lower.length; i++) {
    const cur = ROMAN_MAP[lower[i]];
    const next = ROMAN_MAP[lower[i + 1]];
    total += next && cur < next ? -cur : cur;
  }
  return total > 0 && total < 400 ? total : null;
}

/** "twenty one" / "thirty-two" as well as plain "one". */
function wordsToInt(phrase: string): number | null {
  const parts = phrase.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  let total = 0;
  for (const p of parts) {
    const v = NUMBER_WORDS[p];
    if (v === undefined) return null;
    total += v;
  }
  return total > 0 ? total : null;
}

function parseSpokenNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d{1,3}$/.test(trimmed)) return Number(trimmed);
  return wordsToInt(trimmed) ?? romanToInt(trimmed);
}

const CHAPTER_RE =
  /\b(chapter|part|book|volume|act|episode|section)\s+([0-9]{1,3}|[mdclxvi]{1,7}|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]?(?:one|two|three|four|five|six|seven|eight|nine)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/i;

const PROLOGUE_RE = /\b(prologue|epilogue|introduction|foreword|preface|afterword|appendix)\b/i;

/**
 * Finds where the narrator announces each chapter. Audiobook uploads frequently ship with
 * no chapter markers and no description timestamps, but the reader still says the words —
 * so the captions carry the structure the uploader left out.
 */
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function detectChaptersFromTranscript(
  cues: TranscriptCue[],
  duration: number,
): DetectedChapter[] {
  // Keyed by chapter number so repeats collapse and the earliest mention wins.
  const numbered = new Map<number, { start: number; name: string | null; kind: string }>();
  const extras: { title: string; startSec: number }[] = [];

  for (let i = 0; i < cues.length; i++) {
    const a = cues[i].text;
    const b = cues[i + 1]?.text ?? "";
    // Captions break mid-phrase, so "chapter" and its number often land in
    // neighbouring cues — match across the seam.
    const combined = `${a} ${b}`.replace(/\s+/g, " ");

    const m = combined.match(CHAPTER_RE);
    if (m && m.index !== undefined) {
      const num = parseSpokenNumber(m[2]);
      if (num !== null) {
        const start = m.index < a.length ? cues[i].start : cues[i + 1].start;

        // "Chapter 61. Darrow, the three masters." — punctuation after the number
        // means a real chapter name follows. Plain prose gets no name.
        let name: string | null = null;
        const rest = combined.slice(m.index + m[0].length);
        const nameMatch = rest.match(/^\s*[.:–—-]\s*([^.?!]{2,60})[.?!]/);
        if (nameMatch) {
          const candidate = nameMatch[1].trim();
          if (candidate.split(/\s+/).length <= 8) name = candidate;
        }

        const prev = numbered.get(num);
        if (!prev || start < prev.start) {
          numbered.set(num, { start, name, kind: m[1].toLowerCase() });
        }
      }
    }

    // Front matter only counts as a standalone announcement, never mid-prose.
    const t = a.trim();
    if (t.length < 30) {
      const p = t.match(PROLOGUE_RE);
      if (p && p.index !== undefined && p.index <= 2) {
        extras.push({ title: capitalise(p[1].toLowerCase()), startSec: cues[i].start });
      }
    }
  }

  if (numbered.size < 2) return [];

  // Keep the dominant unit so a stray "book two" doesn't mix into a chaptered read.
  const counts = new Map<string, number>();
  for (const v of numbered.values()) counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
  const dominant = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];

  const sequence = [...numbered.entries()]
    .filter(([, v]) => v.kind === dominant)
    .sort((x, y) => x[0] - y[0]);

  // Numbering need not start at 1 — part 3 of a series opens at chapter 61 — and a single
  // stray mention ("chapter 8" in dialogue) must not anchor the whole sequence. So split
  // into runs of near-consecutive numbers and trust the longest one.
  const runs: (typeof sequence)[] = [];
  for (const entry of sequence) {
    const current = runs[runs.length - 1];
    const prev = current?.[current.length - 1];
    if (current && prev && entry[0] <= prev[0] + 10) current.push(entry);
    else runs.push([entry]);
  }
  const bestRun = runs.sort((x, y) => y.length - x.length)[0] ?? [];

  const kept: DetectedChapter[] = [];
  let lastStart = -1;
  for (const [num, v] of bestRun) {
    if (v.start <= lastStart) continue;
    if (duration > 0 && v.start > duration) continue;
    lastStart = v.start;
    kept.push({
      title: v.name ? `${capitalise(dominant)} ${num}: ${v.name}` : `${capitalise(dominant)} ${num}`,
      startSec: v.start,
      order: 0,
    });
  }

  if (kept.length < 2) return [];

  // Front matter earlier than the first chapter is worth keeping.
  const firstStart = kept[0].startSec;
  for (const e of extras) {
    if (e.startSec < firstStart - 5) kept.push({ ...e, order: 0 });
  }

  kept.sort((x, y) => x.startSec - y.startSec);
  return kept.map((c, i) => ({ ...c, order: i }));
}
