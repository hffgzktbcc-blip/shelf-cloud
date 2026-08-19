/**
 * Figures derived from the daily listening tally.
 *
 * Only what the data actually supports: the app records seconds per calendar day, so
 * streaks, daily averages and a day-by-day chart are real. Session length, time of day and
 * playback speed are not recorded anywhere and are deliberately absent rather than guessed.
 */

export type Day = { date: string; seconds: number };

export function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toLocaleDateString("en-CA");
}

/**
 * Consecutive days with listening, counting back from today. Today not yet having any
 * listening doesn't break a streak — the day isn't over — but an empty yesterday does.
 */
export function currentStreak(days: Day[]): number {
  const withTime = new Map(days.filter((d) => d.seconds > 0).map((d) => [d.date, d.seconds]));
  if (withTime.size === 0) return 0;

  let cursor = today();
  if (!withTime.has(cursor)) cursor = shiftDays(cursor, -1);

  let streak = 0;
  while (withTime.has(cursor)) {
    streak++;
    cursor = shiftDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(days: Day[]): number {
  const sorted = days.filter((d) => d.seconds > 0).map((d) => d.date).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;

  for (const date of sorted) {
    run = previous && shiftDays(previous, 1) === date ? run + 1 : 1;
    previous = date;
    if (run > best) best = run;
  }
  return best;
}

/** The last `count` days ending today, zero-filled so the chart has no gaps. */
export function recentDays(days: Day[], count: number): Day[] {
  const byDate = new Map(days.map((d) => [d.date, d.seconds]));
  const out: Day[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = shiftDays(today(), -i);
    out.push({ date, seconds: byDate.get(date) ?? 0 });
  }
  return out;
}

export function dailyAverage(days: Day[]): number {
  if (days.length === 0) return 0;
  return days.reduce((s, d) => s + d.seconds, 0) / days.length;
}

/**
 * How long what you're part-way through will take at your recent pace. Returns null when
 * there isn't enough listening recorded to say anything honest.
 */
export function paceEta(remainingSec: number, avgSecPerDay: number): number | null {
  if (avgSecPerDay < 60) return null;
  return Math.ceil(remainingSec / avgSecPerDay);
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  const part = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const day = now.toLocaleDateString(undefined, { weekday: "long" });
  return `${day} ${part}`;
}

export type Session = {
  startedAt: Date;
  endedAt: Date;
  seconds: number;
  rateSum: number;
};

/**
 * The median session, not the mean — one four-hour Sunday shouldn't describe a week of
 * twenty-minute commutes. Sessions under a minute are dropped as noise: opening a book,
 * hearing a sentence and closing it isn't a listening session.
 */
export function typicalSession(sessions: Session[]): number | null {
  const real = sessions.map((s) => s.seconds).filter((s) => s >= 60).sort((a, b) => a - b);
  if (real.length === 0) return null;
  const mid = Math.floor(real.length / 2);
  return real.length % 2 ? real[mid] : Math.round((real[mid - 1] + real[mid]) / 2);
}

/**
 * The stretch of the day you actually listen in, as a contiguous window of hours holding
 * the most listening. Returns null until there's enough spread to mean anything.
 */
export function usualHours(sessions: Session[], windowSize = 3): { from: number; to: number } | null {
  const byHour = new Array(24).fill(0) as number[];
  let total = 0;

  for (const s of sessions) {
    // Attribute a session to the hour it began; sessions are short enough that spreading
    // them across hours would add precision the data doesn't have.
    byHour[s.startedAt.getHours()] += s.seconds;
    total += s.seconds;
  }
  if (total < 600) return null;

  let bestStart = 0;
  let best = -1;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) sum += byHour[(start + i) % 24];
    if (sum > best) {
      best = sum;
      bestStart = start;
    }
  }

  // A window holding almost nothing isn't a pattern.
  if (best / total < 0.4) return null;
  return { from: bestStart, to: (bestStart + windowSize) % 24 };
}

/** Weighted by the seconds each rate applied to, so a brief 2x burst doesn't skew it. */
export function averageSpeed(sessions: Session[]): number | null {
  const seconds = sessions.reduce((s, x) => s + x.seconds, 0);
  if (seconds < 300) return null;
  const weighted = sessions.reduce((s, x) => s + x.rateSum, 0);
  return weighted / seconds;
}
