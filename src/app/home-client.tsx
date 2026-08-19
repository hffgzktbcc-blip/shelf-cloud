"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, GripVertical, Library, Play, Quote, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/cover";
import { cn } from "@/lib/utils";
import { formatDuration, formatTime } from "@/lib/format";

export type HomeData = {
  greeting: string;
  minutesToday: number;
  streak: number;
  onTheGo: number;
  week: { label: string; minutes: number }[];
  dailyAverageMin: number;
  resume: {
    bookId: string;
    partId: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    chapterTitle: string | null;
    partLabel: string | null;
    positionSec: number;
    chapterLeftSec: number | null;
    bookLeftSec: number;
    hasEbook: boolean;
  } | null;
  queue: {
    bookId: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    parts: number;
    durationSec: number;
  }[];
  passage: {
    quote: string;
    timeSec: number;
    bookId: string;
    partId: string;
    bookTitle: string;
    bookAuthor: string | null;
    coverUrl: string | null;
  } | null;
};

export function HomeClient({ data }: { data: HomeData }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Header data={data} />
      {data.resume ? <Resume resume={data.resume} /> : <NothingStarted />}
      <Queue initial={data.queue} />
      {data.passage && <Passage passage={data.passage} />}
    </div>
  );
}

function Header({ data }: { data: HomeData }) {
  const bits = [
    data.minutesToday > 0
      ? `${data.minutesToday} ${data.minutesToday === 1 ? "minute" : "minutes"} today`
      : "nothing yet today",
    data.streak > 0 ? `${data.streak}-day streak` : null,
    data.onTheGo > 0 ? `${data.onTheGo} ${data.onTheGo === 1 ? "book" : "books"} on the go` : null,
  ].filter(Boolean);

  const busiest = Math.max(...data.week.map((d) => d.minutes), 1);

  return (
    <header className="mb-9 flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">{data.greeting}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{bits.join(" · ")}</p>
      </div>

      {/* The week at a glance. Flat when there's nothing recorded, which is honest. */}
      <div className="flex items-end gap-1.5" aria-hidden>
        {data.week.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div
              title={`${d.minutes}m`}
              className={cn(
                "w-5 rounded-md transition-all",
                d.minutes > 0 ? "bg-position" : "bg-secondary",
              )}
              style={{ height: `${Math.max(4, (d.minutes / busiest) * 42)}px` }}
            />
            <span className="text-subtle-foreground text-[11px]">{d.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

function Resume({ resume: r }: { resume: NonNullable<HomeData["resume"]> }) {
  return (
    <section className="relative overflow-hidden rounded-xl border">
      {r.coverUrl && (
        <>
          <div
            aria-hidden
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-3xl saturate-150"
            style={{ backgroundImage: `url(${r.coverUrl})` }}
          />
          <div aria-hidden className="from-background/85 to-background/95 absolute inset-0 bg-gradient-to-br" />
        </>
      )}

      <div className="relative flex flex-col gap-7 p-7 sm:flex-row sm:p-9">
        <Link href={`/book/${r.bookId}/play/${r.partId}`} className="group shrink-0">
          <Cover
            src={r.coverUrl}
            className="h-56 w-40 rounded-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-300 group-hover:-translate-y-1"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-subtle-foreground text-xs font-medium tracking-[0.14em] uppercase">
            Pick up where you stopped
          </p>

          <h2 className="mt-3 text-2xl leading-tight font-semibold tracking-tight">
            {r.chapterTitle ?? r.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {r.title}
            {r.partLabel && <span className="text-subtle-foreground"> · {r.partLabel}</span>}
          </p>

          <p className="text-muted-foreground mt-4 text-sm tabular-nums">
            <span className="text-position">{formatTime(r.positionSec)}</span>
            {r.chapterLeftSec !== null && (
              <> · {formatDuration(r.chapterLeftSec)} left in this chapter</>
            )}
            <> · {formatDuration(r.bookLeftSec)} left in the book</>
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href={`/book/${r.bookId}/play/${r.partId}`}>
                <Play className="size-4" />
                Resume at {formatTime(r.positionSec)}
              </Link>
            </Button>
            {r.hasEbook && (
              <Button asChild variant="secondary" size="lg">
                <Link href={`/book/${r.bookId}/play/${r.partId}?tab=text`}>
                  <BookOpen className="size-4" />
                  Read from here instead
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="lg">
              <Link href={`/book/${r.bookId}/play/${r.partId}?recap=1`}>
                <Sparkles className="size-4" />
                Catch me up first
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function NothingStarted() {
  return (
    <section className="border-border/60 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <Library className="text-muted-foreground/40 size-10" />
      <h2 className="mt-4 text-lg font-medium">Nothing on the go</h2>
      <p className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">
        Start something from your shelf and it'll wait for you here.
      </p>
      <Button asChild className="mt-6">
        <Link href="/library">Open your library</Link>
      </Button>
    </section>
  );
}

/** Books parked for later, reorderable by drag. */
function Queue({ initial }: { initial: HomeData["queue"] }) {
  const [items, setItems] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const router = useRouter();

  async function persist(next: HomeData["queue"]) {
    setItems(next);
    await fetch("/api/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((i) => i.bookId) }),
    }).catch(() => {});
  }

  async function remove(bookId: string) {
    setItems((list) => list.filter((i) => i.bookId !== bookId));
    await fetch(`/api/queue?bookId=${bookId}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  function onDrop(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const next = [...items];
    const from = next.findIndex((i) => i.bookId === dragging);
    const to = next.findIndex((i) => i.bookId === targetId);
    next.splice(to, 0, next.splice(from, 1)[0]);
    void persist(next);
    setDragging(null);
  }

  return (
    <section className="mt-11">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
          Listen next
        </h2>
        {items.length > 1 && (
          <span className="text-subtle-foreground text-xs">drag to reorder</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-subtle-foreground rounded-xl border border-dashed px-5 py-8 text-center text-sm">
          Nothing queued. Add a book from your library and it waits here — so the thing you
          stumbled on mid-chapter doesn&apos;t get forgotten.
        </p>
      ) : (
        <ol className="space-y-2">
          {items.map((q, i) => (
            <li
              key={q.bookId}
              draggable
              onDragStart={() => setDragging(q.bookId)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(q.bookId)}
              className={cn(
                "bg-card/50 group flex items-center gap-3 rounded-xl border p-2.5 transition-opacity",
                dragging === q.bookId && "opacity-40",
              )}
            >
              <GripVertical className="text-subtle-foreground size-4 shrink-0 cursor-grab" />
              <span className="text-subtle-foreground w-4 shrink-0 text-center text-xs tabular-nums">
                {i + 1}
              </span>
              <Cover src={q.coverUrl} className="h-12 w-9 shrink-0 rounded-md ring-1 ring-white/10" />

              <div className="min-w-0 flex-1">
                <Link href={`/book/${q.bookId}`} className="hover:text-position block truncate text-sm font-medium">
                  {q.title}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {q.author ?? "Unknown"}
                  {q.parts > 1 && <span className="text-subtle-foreground"> · {q.parts} parts</span>}
                </p>
              </div>

              <span className="text-subtle-foreground hidden shrink-0 text-xs tabular-nums sm:block">
                {formatDuration(q.durationSec)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(q.bookId)}
                aria-label={`Remove ${q.title} from the queue`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Passage({ passage }: { passage: NonNullable<HomeData["passage"]> }) {
  return (
    <section className="relative mt-11 overflow-hidden rounded-xl border">
      {passage.coverUrl && (
        <>
          <div
            aria-hidden
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-3xl saturate-150"
            style={{ backgroundImage: `url(${passage.coverUrl})` }}
          />
          <div aria-hidden className="from-background/85 to-background/95 absolute inset-0 bg-gradient-to-br" />
        </>
      )}
      <div className="relative px-7 py-8">
        <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-[0.14em] uppercase">
          <Quote className="size-3.5" />
          A passage you saved
        </p>
        <blockquote className="mt-4 max-w-2xl text-lg leading-relaxed font-light text-balance">
          {passage.quote}
        </blockquote>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/book/${passage.bookId}/play/${passage.partId}`}>
              <Play className="size-3.5" />
              Hear it
            </Link>
          </Button>
          <p className="text-subtle-foreground text-xs">
            {passage.bookTitle}
            <span className="text-muted-foreground/40 mx-2">·</span>
            {formatTime(passage.timeSec)}
          </p>
        </div>
      </div>
    </section>
  );
}
