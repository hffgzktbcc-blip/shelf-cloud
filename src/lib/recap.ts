import type { TranscriptCue } from "@/lib/types";

export type RecapPreset = { id: string; label: string; question: string };

export const PRESETS: RecapPreset[] = [
  { id: "what_happened", label: "What just happened?", question: "What happened in the last few minutes?" },
  { id: "summarise", label: "Summarise", question: "Summarise this section up to where I am now." },
  { id: "who", label: "Who is this?", question: "Who are the people in the passage I just heard?" },
  { id: "explain", label: "Explain this", question: "Explain what is going on in the passage I just heard." },
];

/**
 * Only narration at or before the listener's position is eligible. The window looks strictly
 * backwards — a single minute of look-ahead is enough to spoil a book.
 */
export function lookback(cues: TranscriptCue[], now: number, windowSec: number): TranscriptCue[] {
  const from = Math.max(0, now - windowSec);
  return cues.filter((c) => c.start <= now && c.start >= from);
}

/**
 * Model-free fallback: picks the most representative sentences from the window by word
 * overlap. Not a summary in any clever sense, but it answers "what just happened" instantly,
 * costs nothing, and cannot invent anything that wasn't said.
 */
export function extractiveRecap(recent: TranscriptCue[], maxSentences = 5): string {
  const text = recent.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 6);
  if (sentences.length <= maxSentences) return sentences.join(" ");

  const STOP = new Set([
    "the","a","an","and","or","but","of","to","in","on","at","for","with","was","were",
    "is","are","be","been","it","its","he","she","they","him","her","them","his","their",
    "that","this","as","had","have","has","i","you","we","not","so","from","by","what",
  ]);

  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (!w || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const scored = sentences.map((s, i) => {
    const words = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const score = words.reduce((sum, w) => sum + (STOP.has(w) ? 0 : (freq.get(w) ?? 0)), 0);
    return { i, s, score: score / Math.max(6, words.length) };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i) // restore narrative order
    .map((x) => x.s)
    .join(" ");
}
