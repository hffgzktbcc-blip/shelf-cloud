"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AudioLines, BookPlus, Bookmark, FileText, Headphones, Play, Quote, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDuration, formatTime } from "@/lib/format";
import { usePlayer } from "@/components/player-provider";
import { Cover } from "@/components/cover";

export type LibraryBook = {
  id: string;
  title: string;
  author: string | null;
  series: string | null;
  coverUrl: string | null;
  partCount: number;
  ebookCount: number;
  bookmarkCount: number;
  totalDuration: number;
  listened: number;
  resumePartId: string | null;
};

export type Passage = {
  quote: string;
  timeSec: number;
  bookId: string;
  partId: string;
  bookTitle: string;
  bookAuthor: string | null;
  coverUrl: string | null;
};

export function LibraryClient({
  books,
  passage,
}: {
  books: LibraryBook[];
  passage?: Passage | null;
}) {
  const [query, setQuery] = useState("");
  const { track } = usePlayer();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author ?? "").toLowerCase().includes(q) ||
        (b.series ?? "").toLowerCase().includes(q),
    );
  }, [books, query]);

  const inProgress = filtered.filter((b) => {
    const pct = b.totalDuration > 0 ? (b.listened / b.totalDuration) * 100 : 0;
    return pct > 0.5 && pct < 99;
  });
  const rest = filtered.filter((b) => !inProgress.includes(b));

  const totalHours = books.reduce((s, b) => s + b.totalDuration, 0) / 3600;
  // Books arrive newest-first, so the first in-progress one is the last thing listened to.
  const hero = query.trim() ? null : inProgress[0] ?? null;
  const heroRest = hero ? inProgress.filter((b) => b.id !== hero.id) : inProgress;

  if (books.length === 0) return <EmptyLibrary />;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Your Library</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {books.length} {books.length === 1 ? "book" : "books"}
            <span className="text-muted-foreground/40 mx-2">·</span>
            {Math.round(totalHours)} hours of listening
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your shelf…"
              className="h-9 w-56 pl-9"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button asChild className="h-9">
            <Link href="/discover">
              <BookPlus className="size-4" />
              Add a book
            </Link>
          </Button>
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-20 text-center text-sm">
          Nothing matches “{query}”.
        </p>
      ) : (
        <div className="space-y-12">
          {hero && <Hero book={hero} playing={track?.partId === hero.resumePartId} />}
          {passage && <PassageOfTheDay passage={passage} />}
          {heroRest.length > 0 && (
            <Shelf title="Continue listening" books={heroRest} playingPartId={track?.partId} />
          )}
          {rest.length > 0 && (
            <Shelf
              title={inProgress.length > 0 ? "Everything else" : undefined}
              books={rest}
              playingPartId={track?.partId}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A passage you saved, handed back to you. */
function PassageOfTheDay({ passage }: { passage: Passage }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border">
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

      <div className="relative px-7 py-8 sm:px-9">
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
            {passage.bookAuthor ? ` · ${passage.bookAuthor}` : ""}
            <span className="text-muted-foreground/40 mx-2">·</span>
            {formatTime(passage.timeSec)}
          </p>
        </div>
      </div>
    </section>
  );
}

function Hero({ book, playing }: { book: LibraryBook; playing: boolean }) {
  const pct = book.totalDuration > 0 ? (book.listened / book.totalDuration) * 100 : 0;
  const remaining = Math.max(0, book.totalDuration - book.listened);
  const href = book.resumePartId
    ? `/book/${book.id}/play/${book.resumePartId}`
    : `/book/${book.id}`;

  return (
    <section className="relative overflow-hidden rounded-2xl border">
      {/* The cover, blurred, doubles as the backdrop so each book colours its own hero. */}
      {book.coverUrl && (
        <div
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-2xl"
          style={{ backgroundImage: `url(${book.coverUrl})` }}
        />
      )}
      <div className="from-background/80 to-background/95 absolute inset-0 bg-gradient-to-r" />

      <div className="relative flex flex-col gap-7 p-7 sm:flex-row sm:items-center sm:p-9">
        <Link href={href} className="group shrink-0">
          <Cover
            src={book.coverUrl}
            className="size-40 rounded-xl shadow-2xl ring-1 ring-white/10 sm:size-48"
            imgClassName="transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-[0.14em] uppercase">
            {playing ? (
              <>
                <AudioLines className="size-3.5" />
                Now playing
              </>
            ) : (
              "Pick up where you left off"
            )}
          </p>

          <h2 className="mt-3 line-clamp-2 text-3xl leading-tight font-semibold tracking-tight">
            {book.title}
          </h2>
          {book.author && <p className="text-muted-foreground mt-1.5">{book.author}</p>}

          <div className="mt-6 max-w-md">
            <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
              <div className="bg-position h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-muted-foreground mt-2 text-xs tabular-nums">
              {Math.round(pct)}% through
              <span className="text-muted-foreground/40 mx-2">·</span>
              {formatDuration(remaining)} left
              {book.partCount > 1 && (
                <>
                  <span className="text-muted-foreground/40 mx-2">·</span>
                  {book.partCount} parts
                </>
              )}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild size="lg" className="h-11">
              <Link href={href}>
                <Play className="size-4" />
                {playing ? "Back to the player" : "Resume"}
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="h-11">
              <Link href={`/book/${book.id}`}>Book details</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Shelf({
  title,
  books,
  playingPartId,
}: {
  title?: string;
  books: LibraryBook[];
  playingPartId?: string;
}) {
  return (
    <section>
      {title && (
        <h2 className="text-muted-foreground mb-5 text-xs font-medium tracking-[0.14em] uppercase">
          {title}
        </h2>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">
        {books.map((b) => (
          <BookCard key={b.id} book={b} playing={!!playingPartId && playingPartId === b.resumePartId} />
        ))}
      </div>
    </section>
  );
}

function BookCard({ book, playing }: { book: LibraryBook; playing: boolean }) {
  const pct = book.totalDuration > 0 ? (book.listened / book.totalDuration) * 100 : 0;
  const remaining = Math.max(0, book.totalDuration - book.listened);
  const href = book.resumePartId
    ? `/book/${book.id}/play/${book.resumePartId}`
    : `/book/${book.id}`;

  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <div className="bg-muted relative aspect-square overflow-hidden rounded-xl shadow-lg ring-1 ring-white/8 transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-focus-visible:ring-2 group-focus-visible:ring-white/40">
        <Cover
          src={book.coverUrl}
          className="absolute inset-0"
          imgClassName="transition-transform duration-500 group-hover:scale-[1.04]"
        />

        {/* Keeps the meta legible over bright cover art. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {playing && (
          <span className="bg-primary text-primary-foreground absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium shadow">
            <AudioLines className="size-3" />
            Playing
          </span>
        )}

        {pct > 0.5 && (
          <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
            {formatDuration(remaining)} left
          </span>
        )}

        {pct > 0.5 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/40">
            <div className="bg-position h-full" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="mt-3">
        <h3
          className={cn(
            "line-clamp-2 text-sm leading-snug font-medium transition-colors",
            "group-hover:text-primary",
          )}
        >
          {book.title}
        </h3>
        {book.author && (
          <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">{book.author}</p>
        )}
        <div className="text-muted-foreground mt-2 flex items-center gap-2.5 text-xs">
          <span className="tabular-nums">{formatDuration(book.totalDuration)}</span>
          {book.partCount > 1 && <span>{book.partCount} parts</span>}
          {book.ebookCount > 0 && <FileText className="size-3" />}
          {book.bookmarkCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Bookmark className="size-3" />
              {book.bookmarkCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyLibrary() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="text-4xl font-semibold tracking-tight">Your Library</h1>
      <div className="border-border/60 mt-10 flex flex-col items-center rounded-2xl border border-dashed px-6 py-24 text-center">
        <Headphones className="text-muted-foreground/40 size-12" />
        <h2 className="mt-5 text-lg font-medium">Nothing on the shelf yet</h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
          Search YouTube from inside the app, or paste a link to any audiobook. Chapters and
          transcripts come along automatically.
        </p>
        <Button asChild className="mt-7 h-10">
          <Link href="/discover">
            <BookPlus className="size-4" />
            Find an audiobook
          </Link>
        </Button>
      </div>
    </div>
  );
}
