"use client";

import Link from "next/link";
import { Bookmark, Clock, FileText, ListTree } from "lucide-react";
import { Cover } from "@/components/cover";

export type StatsData = {
  books: {
    id: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    parts: number;
    totalSec: number;
    listenedSec: number;
  }[];
  days: { date: string; seconds: number }[];
  bookmarks: number;
  chapters: number;
  ebooks: number;
};

const HEATMAP_WEEKS = 26;

function hours(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0)}h`;
}

export function StatsClient({ data }: { data: StatsData }) {
  const listened = data.books.reduce((s, b) => s + b.listenedSec, 0);
  const total = data.books.reduce((s, b) => s + b.totalSec, 0);
  const started = data.books.filter((b) => b.listenedSec > 60);
  const recorded = data.days.reduce((s, d) => s + d.seconds, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-9">
        <h1 className="text-4xl font-semibold tracking-tight">Stats</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {data.books.length} books on the shelf
          <span className="text-muted-foreground/40 mx-2">·</span>
          {started.length} started
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Clock} label="Listened" value={hours(listened)} sub={`of ${hours(total)}`} />
        <Metric icon={ListTree} label="Chapters" value={String(data.chapters)} sub="detected" />
        <Metric icon={Bookmark} label="Bookmarks" value={String(data.bookmarks)} sub="saved" />
        <Metric icon={FileText} label="Ebooks" value={String(data.ebooks)} sub="loaded" />
      </div>

      <Section title="Progress through the shelf">
        <div className="space-y-3">
          {data.books
            .slice()
            .sort((a, b) => b.listenedSec / (b.totalSec || 1) - a.listenedSec / (a.totalSec || 1))
            .map((b) => {
              const pct = b.totalSec > 0 ? (b.listenedSec / b.totalSec) * 100 : 0;
              return (
                <Link
                  key={b.id}
                  href={`/book/${b.id}`}
                  className="hover:bg-card/50 flex items-center gap-3 rounded-lg p-2 transition-colors"
                >
                  <Cover src={b.coverUrl} className="h-14 w-10 shrink-0 rounded ring-1 ring-white/10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.title}</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
                        <div className="bg-position h-full rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-subtle-foreground w-24 shrink-0 text-right text-xs tabular-nums">
                        {hours(b.listenedSec)} / {hours(b.totalSec)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>
      </Section>

      <Section title="Listening by day">
        {recorded === 0 ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            Nothing recorded yet. The app only ever stored where you were in a book, never when
            you listened — so there is no past to show here. It starts counting from today, and
            this fills in as you listen.
          </p>
        ) : (
          <Heatmap days={data.days} />
        )}
      </Section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-card/50 rounded-xl border p-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-subtle-foreground mt-0.5 text-xs">{sub}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-11">
      <h2 className="text-muted-foreground mb-4 text-xs font-medium tracking-[0.14em] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A calendar grid of the last few months, one column per week. */
function Heatmap({ days }: { days: { date: string; seconds: number }[] }) {
  const byDate = new Map(days.map((d) => [d.date, d.seconds]));
  const busiest = Math.max(...days.map((d) => d.seconds), 1);

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - HEATMAP_WEEKS * 7);
  // Begin on a Sunday so every column is a clean week.
  start.setDate(start.getDate() - start.getDay());

  const weeks: { date: string; seconds: number }[][] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const week: { date: string; seconds: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const key = cursor.toLocaleDateString("en-CA");
      week.push({ date: key, seconds: byDate.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {week.map((day) => {
              const level = day.seconds === 0 ? 0 : Math.ceil((day.seconds / busiest) * 4);
              return (
                <div
                  key={day.date}
                  title={`${day.date} — ${day.seconds ? hours(day.seconds) : "nothing"}`}
                  className="size-[11px] rounded-[2px]"
                  style={{
                    backgroundColor:
                      level === 0
                        ? "var(--secondary)"
                        : `color-mix(in oklch, var(--primary) ${level * 25}%, var(--secondary))`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-subtle-foreground mt-3 text-xs">
        {hours(days.reduce((s, d) => s + d.seconds, 0))} recorded since tracking began
      </p>
    </div>
  );
}
