"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, LayoutGrid, Link2, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { GENRES, type Genre } from "@/lib/genres";
import type { SearchHit } from "@/lib/types";

export function DiscoverClient({
  suggestions,
}: {
  suggestions?: { authors: string[]; narrators: string[] };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    void searchFor(query);
  }

  async function searchFor(term: string) {
    if (!term.trim()) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.items ?? []);
      if ((data.items ?? []).length === 0) toast.info("No results — try different wording.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function addBook(link: string, label?: string) {
    setAddingId(label ?? link);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add that book");

      if (data.duplicate) {
        toast.info("Already in your library — opening it.");
      } else {
        toast.success("Added to your library");
      }
      startTransition(() => router.push(`/book/${data.book.id}`));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Discover</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Search YouTube for audiobooks or paste a link — everything stays in the app.
      </p>

      <Tabs defaultValue="search" className="mt-6">
        <TabsList>
          <TabsTrigger value="search">
            <Search className="size-4" />
            Search
          </TabsTrigger>
          <TabsTrigger value="browse">
            <LayoutGrid className="size-4" />
            Browse
          </TabsTrigger>
          <TabsTrigger value="link">
            <Link2 className="size-4" />
            Paste a link
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-5">
          <form onSubmit={runSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, author, or series…"
              aria-label="Search YouTube for an audiobook"
              className="h-11"
            />
            <Button type="submit" disabled={searching || !query.trim()} className="h-11 px-5">
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </Button>
          </form>
          <p className="text-muted-foreground mt-2 text-xs">
            Results are filtered to long videos, which is where full audiobooks live.
          </p>

          {!results && !searching && suggestions && (
            <div className="mt-9 space-y-7">
              {suggestions.authors.length > 0 && (
                <SuggestionRow
                  label="More from authors you're reading"
                  items={suggestions.authors}
                  onPick={(t) => {
                    setQuery(t);
                    void searchFor(t);
                  }}
                />
              )}
              {suggestions.narrators.length > 0 && (
                <SuggestionRow
                  label="Narrators you've listened to"
                  items={suggestions.narrators}
                  onPick={(t) => {
                    setQuery(t);
                    void searchFor(t);
                  }}
                />
              )}
              <SuggestionRow
                label="Somewhere to start"
                items={[
                  "classic literature full audiobook",
                  "science fiction full audiobook",
                  "mystery full audiobook",
                  "history full audiobook",
                ]}
                onPick={(t) => {
                  setQuery(t);
                  void searchFor(t);
                }}
              />
            </div>
          )}

          {searching && (
            <div className="text-muted-foreground mt-10 flex flex-col items-center gap-3 text-sm">
              <Loader2 className="size-6 animate-spin" />
              Searching YouTube…
            </div>
          )}

          {results && results.length > 0 && (
            <div className="mt-6 space-y-3">
              {results.map((hit) => (
                <ResultRow
                  key={hit.videoId}
                  hit={hit}
                  busy={addingId === hit.videoId || pending}
                  onAdd={() => addBook(`https://www.youtube.com/watch?v=${hit.videoId}`, hit.videoId)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="browse" className="mt-5">
          <div className="space-y-2">
            {GENRES.map((g) => (
              <GenreShelf
                key={g.slug}
                genre={g}
                onAdd={(videoId) =>
                  addBook(`https://www.youtube.com/watch?v=${videoId}`, videoId)
                }
                addingId={addingId}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="link" className="mt-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) addBook(url.trim());
            }}
            className="flex gap-2"
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="YouTube link"
              className="h-11"
            />
            <Button type="submit" disabled={!url.trim() || addingId !== null} className="h-11 px-5">
              {addingId ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>
          <p className="text-muted-foreground mt-2 text-xs">
            Chapters come from the video&apos;s own chapter markers, or from timestamps in the
            description.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GenreShelf({
  genre,
  onAdd,
  addingId,
}: {
  genre: Genre;
  onAdd: (videoId: string) => void;
  addingId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || hits) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(genre.query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load this shelf");
      // Full books, not clips or single chapters.
      setHits((data.items ?? []).filter((h: SearchHit) => h.durationSec >= 3600).slice(0, 12));
    } catch (e) {
      toast.error((e as Error).message);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <button
        onClick={toggle}
        className="hover:bg-accent/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{genre.label}</h3>
          <p className="text-muted-foreground truncate text-xs">{genre.blurb}</p>
        </div>
        {loading && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && hits && (
        <div className="border-t p-2">
          {hits.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">
              Nothing long enough came back — try the search tab.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {hits.map((h) => (
                <button
                  key={h.videoId}
                  onClick={() => onAdd(h.videoId)}
                  disabled={addingId === h.videoId}
                  className="hover:bg-accent/50 flex items-center gap-2.5 rounded-md p-1.5 text-left transition-colors disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={h.thumbUrl}
                    alt=""
                    className="bg-muted h-11 w-[74px] shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs leading-snug">{h.title}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {h.durationText}
                    </p>
                  </div>
                  {addingId === h.videoId ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <Plus className="text-muted-foreground size-4 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ResultRow({ hit, busy, onAdd }: { hit: SearchHit; busy: boolean; onAdd: () => void }) {
  const isLong = hit.durationSec >= 3600;
  return (
    <Card className="flex flex-row items-center gap-4 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={hit.thumbUrl}
        alt=""
        className="bg-muted h-[68px] w-[120px] shrink-0 rounded-md object-cover"
      />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm leading-snug font-medium">{hit.title}</h3>
        <p className="text-muted-foreground mt-1 truncate text-xs">{hit.channel}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge variant={isLong ? "default" : "secondary"} className="gap-1 px-1.5 py-0 text-xs">
            <Clock className="size-2.5" />
            {hit.durationText}
          </Badge>
          {isLong && (
            <span className="text-muted-foreground text-xs">{formatDuration(hit.durationSec)}</span>
          )}
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={onAdd} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Add
      </Button>
    </Card>
  );
}

/** Clickable starting points, so the page isn't a blank box waiting for inspiration. */
function SuggestionRow({
  label,
  items,
  onPick,
}: {
  label: string;
  items: string[];
  onPick: (term: string) => void;
}) {
  return (
    <div>
      <p className="text-subtle-foreground mb-2.5 text-xs font-medium tracking-[0.14em] uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            onClick={() => onPick(item)}
            className="border-border/70 hover:border-primary/60 hover:text-foreground text-muted-foreground rounded-full border px-3.5 py-1.5 text-sm transition-colors"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
