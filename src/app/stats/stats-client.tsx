"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, CircleCheckBig, Clock, FileText, Flame, ListTree } from "lucide-react";
import { Cover } from "@/components/cover";
import { cn } from "@/lib/utils";

export type StatsData = {
  books: {
    id: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    finished: boolean;
    totalSec: number;
    listenedSec: number;
    remainingSec: number;
    pct: number;
  }[];
  days: { date: string; seconds: number }[];
  last14: { date: string; label: string; minutes: number }[];
  dailyAverageSec: number;
  currentStreak: number;
  longestStreak: number;
  trackingSince: string | null;
  bookmarks: number;
  chapters: number;
  ebooks: number;
  pace: {
    id: string;
    title: string;
    coverUrl: string | null;
    remainingSec: number;
    days: number | null;
  }[];
};

type Range = "14" | "90" | "all";

function hours(sec: number): string {
  if (sec < 60) return "0m";
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0)}h`;
}

export function StatsClient({ data }: { data: StatsData }) {
  const [range, setRange] = useState<Range>("14");

  const cutoff =
    range === "all"
      ? null
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - Number(range));
          return d.toLocaleDateString("en-CA");
        })();

  const inRange = cutoff ? data.days.filter((d) => d.date >= cutoff) : data.days;
  const listenedInRange = inRange.reduce((s, d) => s + d.seconds, 0);

  const started = data.books.filter((b) => b.pct > 0.5);
  const finished = data.books.filter((b) => b.finished || b.pct >= 99);
  const shelfTotal = data.books.reduce((s, b) => s + b.totalSec, 0);
  const shelfListened = data.books.reduce((s, b) => s + b.listenedSec, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Stats</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {data.trackingSince
              ? `Tracking since ${new Date(`${data.trackingSince}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`
              : "Nothing tracked yet"}
            <span className="text-muted-foreground/40 mx-2">·</span>
            {data.books.length} books
            <span className="text-muted-foreground/40 mx-2">·</span>
            {started.length} started
          </p>
        </div>

        <div className="bg-secondary flex rounded-md p-0.5 text-xs">
          {(
            [
              ["14", "14 days"],
              ["90", "90 days"],
              ["all", "All time"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                range === k ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Clock} label="Listened" value={hours(listenedInRange)} sub={rangeLabel(range)} />
        <Metric
          icon={Flame}
          label="Streak"
          value={data.currentStreak > 0 ? `${data.currentStreak}d` : "—"}
          sub={data.longestStreak > 0 ? `longest ${data.longestStreak}d` : "no streak yet"}
        />
        <Metric
          icon={Clock}
          label="Daily average"
          value={hours(data.dailyAverageSec)}
          sub="last 14 days"
        />
        <Metric
          icon={CircleCheckBig}
          label="Finished"
          value={String(finished.length)}
          sub={`of ${data.books.length} books`}
        />
      </div>

      <Section title="Last 14 days" aside={`daily average ${hours(data.dailyAverageSec)}`}>
        <Bars days={data.last14} />
      </Section>

      {data.pace.length > 0 && (
        <Section title="At this pace">
          <div className="space-y-2">
            {data.pace.map((p) => (
              <Link
                key={p.id}
                href={`/book/${p.id}`}
                className="bg-card/50 hover:bg-card flex items-center gap-3 rounded-xl border p-3 transition-colors"
              >
                <Cover src={p.coverUrl} className="h-12 w-9 shrink-0 rounded-md ring-1 ring-white/10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-muted-foreground text-xs">{hours(p.remainingSec)} left</p>
                </div>
                <span className="text-position shrink-0 text-sm tabular-nums">
                  {p.days === null ? "—" : p.days === 1 ? "tomorrow" : `${p.days} days`}
                </span>
              </Link>
            ))}
          </div>
          <p className="text-subtle-foreground mt-3 text-xs leading-relaxed">
            {data.dailyAverageSec >= 60
              ? `Based on your last 14 days at ${hours(data.dailyAverageSec)} a day.`
              : "Not enough listening recorded yet to estimate — this fills in as you listen."}
          </p>
        </Section>
      )}

      <Section title="Progress through the shelf" aside={`${hours(shelfListened)} of ${hours(shelfTotal)}`}>
        <div className="space-y-2">
          {[...data.books]
            .sort((a, b) => b.pct - a.pct)
            .map((b) => (
              <Link
                key={b.id}
                href={`/book/${b.id}`}
                className="hover:bg-card/60 flex items-center gap-3 rounded-xl p-2 transition-colors"
              >
                <Cover src={b.coverUrl} className="h-14 w-10 shrink-0 rounded-md ring-1 ring-white/10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.title}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
                      <div className="bg-position h-full rounded-full" style={{ width: `${b.pct}%` }} />
                    </div>
                    <span className="text-subtle-foreground w-24 shrink-0 text-right text-xs tabular-nums">
                      {hours(b.listenedSec)} / {hours(b.totalSec)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
        </div>
      </Section>

      <Section title="Also on the shelf">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric icon={ListTree} label="Chapters" value={String(data.chapters)} sub="detected" />
          <Metric icon={Bookmark} label="Bookmarks" value={String(data.bookmarks)} sub="saved" />
          <Metric icon={FileText} label="Ebooks" value={String(data.ebooks)} sub="loaded" />
        </div>
      </Section>

      <p className="text-subtle-foreground mt-11 text-xs leading-relaxed">
        Session length, time of day and average speed aren&apos;t here because none of them are
        recorded — the app stores seconds per calendar day, with no session boundaries, clock
        time or playback rate. They&apos;d be invented rather than measured.
      </p>
    </div>
  );
}

function rangeLabel(r: Range) {
  return r === "all" ? "all time" : `last ${r} days`;
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

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-11">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
          {title}
        </h2>
        {aside && <span className="text-subtle-foreground text-xs">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Bars({ days }: { days: StatsData["last14"] }) {
  const busiest = Math.max(...days.map((d) => d.minutes), 1);
  return (
    <div className="flex items-end gap-2">
      {days.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-subtle-foreground text-[11px] tabular-nums">
            {d.minutes > 0 ? d.minutes : ""}
          </span>
          <div
            title={`${d.date} — ${d.minutes}m`}
            className={cn(
              "w-full rounded-md transition-all",
              d.minutes > 0 ? "bg-position" : "bg-secondary",
            )}
            style={{ height: `${Math.max(4, (d.minutes / busiest) * 90)}px` }}
          />
          <span className="text-subtle-foreground text-[11px] tabular-nums">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
