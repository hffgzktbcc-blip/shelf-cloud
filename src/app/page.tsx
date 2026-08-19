import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStreak, dailyAverage, greeting, recentDays, today } from "@/lib/listening";
import { HomeClient, type HomeData } from "./home-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shelf" };

export default async function HomePage() {
  // First run only: an empty shelf with no welcome on record.
  const seen = await prisma.setting.findUnique({ where: { key: "welcomeSeen" } });
  if (!seen) {
    const existing = await prisma.book.count();
    if (existing === 0) redirect("/welcome");
  }

  const [books, days, queue, passages] = await Promise.all([
    prisma.book.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        parts: { orderBy: { order: "asc" }, include: { chapters: { orderBy: { order: "asc" } } } },
        ebooks: { select: { id: true } },
      },
    }),
    prisma.listeningDay.findMany({ orderBy: { date: "asc" } }),
    prisma.queueItem.findMany({
      orderBy: { order: "asc" },
      include: { book: { include: { parts: true } } },
    }),
    prisma.bookmark.findMany({
      where: { quote: { not: null } },
      include: { book: { select: { id: true, title: true, author: true, coverUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const week = recentDays(days, 7);
  const minutesToday = Math.round((days.find((d) => d.date === today())?.seconds ?? 0) / 60);

  // "On the go" is anything genuinely part-way through, not merely opened.
  const inProgress = books.filter((b) => {
    const total = b.parts.reduce((s, p) => s + p.duration, 0);
    const heard = b.parts.reduce((s, p) => s + p.positionSec, 0);
    return total > 0 && heard > 60 && heard / total < 0.99;
  });

  const resumeBook = inProgress[0] ?? null;
  const resumePart =
    resumeBook?.parts.find((p) => !p.completed && p.positionSec > 0) ??
    resumeBook?.parts.find((p) => !p.completed) ??
    resumeBook?.parts[0] ??
    null;

  const chapter = resumePart
    ? [...resumePart.chapters].reverse().find((c) => c.startSec <= resumePart.positionSec) ?? null
    : null;

  const data: HomeData = {
    greeting: greeting(),
    minutesToday,
    streak: currentStreak(days),
    onTheGo: inProgress.length,
    week: week.map((d) => ({
      label: new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" }),
      minutes: Math.round(d.seconds / 60),
    })),
    dailyAverageMin: Math.round(dailyAverage(recentDays(days, 14)) / 60),

    resume: resumeBook && resumePart
      ? {
          bookId: resumeBook.id,
          partId: resumePart.id,
          title: resumeBook.title,
          author: resumeBook.author,
          coverUrl: resumeBook.coverUrl,
          chapterTitle: chapter?.title ?? null,
          partLabel:
            resumeBook.parts.length > 1
              ? `Part ${resumePart.order + 1} of ${resumeBook.parts.length}`
              : null,
          positionSec: resumePart.positionSec,
          chapterLeftSec: chapter
            ? Math.max(
                0,
                (resumePart.chapters.find((c) => c.order === chapter.order + 1)?.startSec ??
                  resumePart.duration) - resumePart.positionSec,
              )
            : null,
          bookLeftSec: resumeBook.parts.reduce(
            (s, p) => s + Math.max(0, p.duration - p.positionSec),
            0,
          ),
          hasEbook: resumeBook.ebooks.length > 0,
        }
      : null,

    queue: queue.map((q) => {
      const total = q.book.parts.reduce((s, p) => s + p.duration, 0);
      return {
        bookId: q.book.id,
        title: q.book.title,
        author: q.book.author,
        coverUrl: q.book.coverUrl,
        parts: q.book.parts.length,
        durationSec: total,
      };
    }),

    passage:
      passages.length > 0
        ? (() => {
            const seed = [...today()].reduce((a, c) => a + c.charCodeAt(0), 0);
            const pick = passages[seed % passages.length];
            return {
              quote: pick.quote!,
              timeSec: pick.timeSec,
              bookId: pick.book.id,
              partId: pick.partId,
              bookTitle: pick.book.title,
              bookAuthor: pick.book.author,
              coverUrl: pick.book.coverUrl,
            };
          })()
        : null,
  };

  return <HomeClient data={data} />;
}
