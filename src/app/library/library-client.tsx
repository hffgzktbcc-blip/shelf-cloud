"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  BookPlus,
  Bookmark,
  FileText,
  LayoutGrid,
  ListTree,
  Plus,
  Rows3,
  Search,
  Waypoints,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cover } from "@/components/cover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { usePlayer } from "@/components/player-provider";

export type LibraryBook = {
  id: string;
  title: string;
  author: string | null;
  series: string | null;
  coverUrl: string | null;
  partCount: number;
  chapterCount: number;
  ebookCount: number;
  alignedMarks: number;
  bookmarkCount: number;
  totalDuration: number;
  listened: number;
  resumePartId: string | null;
  addedAt: string;
  shelfIds: string[];
  queued: boolean;
};

type Shelf = { id: string; name: string; count: number };

const SORTS = {
  recent: { label: "Last listened", fn: (a: LibraryBook, b: LibraryBook) => 0 },
  title: { label: "Title", fn: (a: LibraryBook, b: LibraryBook) => a.title.localeCompare(b.title) },
  author: {
    label: "Author",
    fn: (a: LibraryBook, b: LibraryBook) => (a.author ?? "").localeCompare(b.author ?? ""),
  },
  progress: {
    label: "Progress",
    fn: (a: LibraryBook, b: LibraryBook) => pct(b) - pct(a),
  },
  longest: {
    label: "Longest",
    fn: (a: LibraryBook, b: LibraryBook) => b.totalDuration - a.totalDuration,
  },
} as const;

type SortKey = keyof typeof SORTS;

function pct(b: LibraryBook) {
  return b.totalDuration > 0 ? (b.listened / b.totalDuration) * 100 : 0;
}

/** Filters phrased as questions you'd actually ask of a shelf. */
const FILTERS = {
  unfinished: { label: "Unfinished", test: (b: LibraryBook) => pct(b) > 0.5 && pct(b) < 99 },
  untouched: { label: "Not started", test: (b: LibraryBook) => pct(b) <= 0.5 },
  noEbook: { label: "No ebook", test: (b: LibraryBook) => b.ebookCount === 0 },
  notAligned: {
    label: "Never aligned",
    test: (b: LibraryBook) => b.ebookCount > 0 && b.alignedMarks < 2,
  },
  noChapters: { label: "No chapters", test: (b: LibraryBook) => b.chapterCount === 0 },
} as const;

type FilterKey = keyof typeof FILTERS;

export function LibraryClient({ books, shelves }: { books: LibraryBook[]; shelves: Shelf[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [active, setActive] = useState<FilterKey | null>(null);
  const [shelf, setShelf] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("list");
  const { track } = usePlayer();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = books;
    if (q) {
      out = out.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.author ?? "").toLowerCase().includes(q) ||
          (b.series ?? "").toLowerCase().includes(q),
      );
    }
    if (active) out = out.filter(FILTERS[active].test);
    if (shelf) out = out.filter((b) => b.shelfIds.includes(shelf));
    return sort === "recent" ? out : [...out].sort(SORTS[sort].fn);
  }, [books, query, active, shelf, sort]);

  const totalHours = books.reduce((s, b) => s + b.totalDuration, 0) / 3600;
  const listenedHours = books.reduce((s, b) => s + b.listened, 0) / 3600;

  async function newShelf() {
    const name = window.prompt("Name this shelf");
    if (!name?.trim()) return;
    const res = await fetch("/api/shelves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      toast.success(`Shelf “${name.trim()}” created`);
      router.refresh();
    } else toast.error("That name is already taken");
  }

  if (books.length === 0) return <EmptyLibrary />;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-7">
        <h1 className="text-4xl font-semibold tracking-tight">Library</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {books.length} books
          <span className="text-muted-foreground/40 mx-2">·</span>
          {Math.round(totalHours)}h total
          <span className="text-muted-foreground/40 mx-2">·</span>
          {Math.round(listenedHours)}h listened
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, author, or series…"
            aria-label="Search your library"
            className="h-9 pl-9"
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              {SORTS[sort].label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => setSort(k)}>
                {SORTS[k].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="bg-secondary flex rounded-md p-0.5">
          {(["list", "grid"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-label={`${v} view`}
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                view === v ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              {v === "list" ? <Rows3 className="size-4" /> : <LayoutGrid className="size-4" />}
            </button>
          ))}
        </div>

        <Button asChild size="sm">
          <Link href="/discover">
            <BookPlus className="size-4" />
            Add a book
          </Link>
        </Button>
      </div>

      {/* Counts make a filter worth clicking — you can see there are three before you try. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => {
          const count = books.filter(FILTERS[k].test).length;
          if (count === 0) return null;
          return (
            <button
              key={k}
              onClick={() => setActive(active === k ? null : k)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                active === k
                  ? "border-position/60 text-foreground bg-position/10"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {FILTERS[k].label}
              <span className="text-subtle-foreground ml-1.5 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-7 flex flex-wrap items-center gap-1.5">
        <span className="text-subtle-foreground text-xs">Shelves:</span>
        {shelves.map((s) => (
          <button
            key={s.id}
            onClick={() => setShelf(shelf === s.id ? null : s.id)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs transition-colors",
              shelf === s.id
                ? "bg-position/15 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.name}
            <span className="text-subtle-foreground ml-1 tabular-nums">{s.count}</span>
          </button>
        ))}
        <button
          onClick={newShelf}
          className="text-subtle-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 text-xs"
        >
          <Plus className="size-3" />
          New
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-20 text-center text-sm">
          Nothing matches those filters.
        </p>
      ) : view === "list" ? (
        <div className="space-y-1.5">
          {filtered.map((b) => (
            <BookRow key={b.id} book={b} playing={track?.partId === b.resumePartId} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.map((b) => (
            <BookCard key={b.id} book={b} playing={track?.partId === b.resumePartId} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One row saying what the square grid can't: progress, time left, and what exists. */
function BookRow({ book, playing }: { book: LibraryBook; playing: boolean }) {
  const p = pct(book);
  const remaining = Math.max(0, book.totalDuration - book.listened);
  const href = book.resumePartId
    ? `/book/${book.id}/play/${book.resumePartId}`
    : `/book/${book.id}`;

  return (
    <Link
      href={href}
      className="bg-card/50 hover:bg-card group flex items-center gap-4 rounded-xl border p-3 transition-colors"
    >
      <Cover src={book.coverUrl} className="h-16 w-11 shrink-0 rounded-md ring-1 ring-white/10" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="group-hover:text-position truncate text-sm font-medium transition-colors">
            {book.title}
          </p>
          {playing && <AudioLines className="text-position size-3.5 shrink-0" />}
          {book.queued && (
            <span className="text-subtle-foreground shrink-0 text-xs">queued</span>
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs">{book.author ?? "Unknown"}</p>

        <div className="mt-2 flex items-center gap-3">
          <div className="bg-secondary h-1 max-w-56 flex-1 overflow-hidden rounded-full">
            <div className="bg-position h-full rounded-full" style={{ width: `${p}%` }} />
          </div>
          <span className="text-subtle-foreground shrink-0 text-xs tabular-nums">
            {p < 0.5 ? formatDuration(book.totalDuration) : `${formatDuration(remaining)} left`}
          </span>
        </div>
      </div>

      <div className="text-subtle-foreground hidden shrink-0 items-center gap-3 text-xs sm:flex">
        {book.partCount > 1 && <span>{book.partCount} parts</span>}
        {book.chapterCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListTree className="size-3" />
            {book.chapterCount}
          </span>
        )}
        {book.ebookCount > 0 && (
          <span
            className={cn("inline-flex items-center gap-1", book.alignedMarks > 1 && "text-position")}
            title={book.alignedMarks > 1 ? "Text follows the narration" : "Ebook loaded, not aligned"}
          >
            {book.alignedMarks > 1 ? <Waypoints className="size-3" /> : <FileText className="size-3" />}
          </span>
        )}
        {book.bookmarkCount > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Bookmark className="size-3" />
            {book.bookmarkCount}
          </span>
        )}
      </div>
    </Link>
  );
}

function BookCard({ book, playing }: { book: LibraryBook; playing: boolean }) {
  const p = pct(book);
  const href = book.resumePartId
    ? `/book/${book.id}/play/${book.resumePartId}`
    : `/book/${book.id}`;

  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <div className="bg-muted relative aspect-square overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/8 transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1">
        <Cover src={book.coverUrl} className="absolute inset-0" />
        {playing && (
          <span className="bg-position text-primary-foreground absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
            <AudioLines className="size-3" />
            Playing
          </span>
        )}
        {p > 0.5 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/40">
            <div className="bg-position h-full" style={{ width: `${p}%` }} />
          </div>
        )}
      </div>
      <h3 className="group-hover:text-position mt-3 line-clamp-2 text-sm leading-snug font-medium transition-colors">
        {book.title}
      </h3>
      {book.author && (
        <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">{book.author}</p>
      )}
    </Link>
  );
}

function EmptyLibrary() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="text-4xl font-semibold tracking-tight">Library</h1>
      <div className="border-border/60 mt-10 flex flex-col items-center rounded-xl border border-dashed px-6 py-24 text-center">
        <BookPlus className="text-muted-foreground/40 size-12" />
        <h2 className="mt-5 text-lg font-medium">Nothing on the shelf yet</h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
          Search YouTube from inside the app, or paste a link to any audiobook. Chapters and
          transcripts come along automatically.
        </p>
        <Button asChild className="mt-7">
          <Link href="/discover">Find an audiobook</Link>
        </Button>
      </div>
    </div>
  );
}
