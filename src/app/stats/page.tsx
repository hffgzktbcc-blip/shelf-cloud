import { prisma } from "@/lib/db";
import { StatsClient, type StatsData } from "./stats-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats — Shelf" };

export default async function StatsPage() {
  const [books, days, bookmarks, chapters, ebooks] = await Promise.all([
    prisma.book.findMany({
      include: { parts: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.listeningDay.findMany({ orderBy: { date: "asc" } }),
    prisma.bookmark.count(),
    prisma.chapter.count(),
    prisma.ebook.count(),
  ]);

  const data: StatsData = {
    books: books.map((b) => {
      const total = b.parts.reduce((s, p) => s + p.duration, 0);
      const listened = b.parts.reduce((s, p) => s + p.positionSec, 0);
      return {
        id: b.id,
        title: b.title,
        author: b.author,
        coverUrl: b.coverUrl,
        parts: b.parts.length,
        totalSec: total,
        listenedSec: listened,
      };
    }),
    days: days.map((d) => ({ date: d.date, seconds: d.seconds })),
    bookmarks,
    chapters,
    ebooks,
  };

  return <StatsClient data={data} />;
}
