/**
 * Playback preferences, stored as one JSON blob in the Setting table so adding a preference
 * doesn't mean a migration or a new allowlist entry each time.
 *
 * Everything here is something the YouTube IFrame API can actually do. Silence trimming and
 * volume boost are deliberately absent: both need the raw audio, which a cross-origin embed
 * never exposes — the same wall that rules out background playback on a phone.
 */

export type Prefs = {
  skipBack: number;
  skipForward: number;
  defaultSpeed: number;
  /** Seconds to step back when picking a book up again, to re-find the thread. */
  rewindOnResume: number;
  sleepDefaultMin: number;
  /** Fade the volume down over the last seconds of a sleep timer rather than cutting. */
  fadeOnSleep: boolean;
  /** Roll straight into the next part when one ends. */
  autoPlayNext: boolean;
  /** "bronze" puts the warm brass back on buttons and controls, as it was originally. */
  accent: "neutral" | "bronze";
};

export const DEFAULT_PREFS: Prefs = {
  skipBack: 15,
  skipForward: 30,
  defaultSpeed: 1,
  rewindOnResume: 0,
  sleepDefaultMin: 30,
  fadeOnSleep: true,
  autoPlayNext: false,
  accent: "bronze",
};

export const PREFS_KEY = "playbackPrefs";

/** Tolerant of a partial or stale blob — anything missing falls back to the default. */
export function parsePrefs(raw: string | null | undefined): Prefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      skipBack: num(parsed.skipBack, DEFAULT_PREFS.skipBack, 5, 120),
      skipForward: num(parsed.skipForward, DEFAULT_PREFS.skipForward, 5, 120),
      defaultSpeed: num(parsed.defaultSpeed, DEFAULT_PREFS.defaultSpeed, 0.25, 4),
      rewindOnResume: num(parsed.rewindOnResume, DEFAULT_PREFS.rewindOnResume, 0, 120),
      sleepDefaultMin: num(parsed.sleepDefaultMin, DEFAULT_PREFS.sleepDefaultMin, 5, 240),
      fadeOnSleep: typeof parsed.fadeOnSleep === "boolean" ? parsed.fadeOnSleep : true,
      autoPlayNext: typeof parsed.autoPlayNext === "boolean" ? parsed.autoPlayNext : false,
      accent: parsed.accent === "neutral" ? "neutral" : "bronze",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
