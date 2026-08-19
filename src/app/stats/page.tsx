import { prisma } from "@/lib/db";
import {
  averageSpeed,
  currentStreak,
  dailyAverage,
  longestStreak,
  paceEta,
  recentDays,
  typicalSession,
  usualHours,
} from "@/lib/listening";
import { StatsClient, type StatsData } from "./stats-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats — Shelf" };

export default async function StatsPage() {
  const [books, days, sessions, bookmarks, chapters, ebooks] = await Promise.all([
    prisma.book.findMany({ include: { parts: true }, orderBy: { updatedAt: "desc" } }),
    prisma.listeningDay.findMany({ orderBy: { date: "asc" } }),
    prisma.listeningSession.findMany({ orderBy: { startedAt: "asc" } }),
    prisma.bookmark.count(),
    prisma.chapter.count(),
    prisma.ebook.count(),
  ]);

  const shaped = books.map((b) => {
    const total = b.parts.reduce((s, p) => s + p.duration, 0);
    const listened = b.parts.reduce((s, p) => s + p.positionSec, 0);
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      coverUrl: b.coverUrl,
      finished: b.finished,
      totalSec: total,
      listenedSec: listened,
      remainingSec: Math.max(0, total - listened),
      pct: total > 0 ? (listened / total) * 100 : 0,
    };
  });

  const avgPerDay = dailyAverage(recentDays(days, 14));

  const data: StatsData = {
    books: shaped,
    days: days.map((d) => ({ date: d.date, seconds: d.seconds })),
    last14: recentDays(days, 14).map((d) => ({
      date: d.date,
      label: new Date(`${d.date}T12:00:00`).getDate().toString(),
      minutes: Math.round(d.seconds / 60),
    })),
    dailyAverageSec: avgPerDay,
    currentStreak: currentStreak(days),
    longestStreak: longestStreak(days),
    trackingSince: days[0]?.date ?? null,
    bookmarks,
    chapters,
    ebooks,

    typicalSessionSec: typicalSession(sessions),
    usual: usualHours(sessions),
    averageSpeed: averageSpeed(sessions),
    sessionCount: sessions.filter((s) => s.seconds >= 60).length,

    // Only for books genuinely under way, and only when there is enough listening
    // recorded for the estimate to mean anything.
    pace: shaped
      .filter((b) => b.pct > 0.5 && b.pct < 99)
      .map((b) => ({
        id: b.id,
        title: b.title,
        coverUrl: b.coverUrl,
        remainingSec: b.remainingSec,
        days: paceEta(b.remainingSec, avgPerDay),
      }))
      .slice(0, 4),
  };

  return <StatsClient data={data} />;
}
