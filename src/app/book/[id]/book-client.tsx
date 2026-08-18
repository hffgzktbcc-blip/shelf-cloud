"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { formatDuration, formatTime } from "@/lib/format";
import { parseAudiobookTitle } from "@/lib/title";
import { CalibrePicker } from "@/components/calibre-picker";
import type { Book, SearchHit } from "@/lib/types";

type Props = { book: Book; links: { name: string; url: string }[] };

export function BookClient({ book, links }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [partUrl, setPartUrl] = useState("");
  const [addingPart, setAddingPart] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [suggestions, setSuggestions] = useState<{ sameSeries: SearchHit[]; related: SearchHit[] } | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const totalDuration = book.parts.reduce((s, p) => s + p.duration, 0);
  const listened = book.parts.reduce((s, p) => s + (p.completed ? p.duration : p.positionSec), 0);
  const pct = totalDuration > 0 ? (listened / totalDuration) * 100 : 0;
  const resumePart =
    book.parts.find((p) => p.id === book.lastPartId) ??
    book.parts.find((p) => !p.completed) ??
    book.parts[0];

  async function addPart(url: string) {
    setAddingPart(true);
    try {
      const res = await fetch(`/api/books/${book.id}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add that part");
      toast.success(`Added: ${data.part.title}`);
      setPartUrl("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAddingPart(false);
    }
  }

  async function findMoreParts() {
    setLoadingSuggestions(true);
    try {
      const first = book.parts[0];
      const qs = new URLSearchParams({
        videoId: first?.videoId ?? "",
        title: book.title,
        channel: first?.channel ?? "",
      });
      const res = await fetch(`/api/youtube/related?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");

      const owned = new Set(book.parts.map((p) => p.videoId));
      setSuggestions({
        sameSeries: (data.sameSeries ?? []).filter((h: SearchHit) => !owned.has(h.videoId)),
        related: (data.related ?? []).filter((h: SearchHit) => !owned.has(h.videoId)),
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function uploadEbook(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("bookId", book.id);
      form.set("file", file);
      const res = await fetch("/api/ebooks", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("Ebook loaded");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function tidyTitle() {
    setTidying(true);
    try {
      const res = await fetch(`/api/books/${book.id}/tidy`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not tidy this title");
      toast.success(`Renamed to "${data.book.title}"`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTidying(false);
    }
  }

  async function deleteBook() {
    if (!confirm(`Remove "${book.title}" from your library? This cannot be undone.`)) return;
    await fetch(`/api/books/${book.id}`, { method: "DELETE" });
    toast.success("Removed from library");
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="bg-muted aspect-square w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-white/5 sm:w-56">
          {book.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.coverUrl} alt="" className="size-full object-cover" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">{book.title}</h1>
          {book.author && <p className="text-muted-foreground mt-1">{book.author}</p>}
          {book.series && (
            <Badge variant="outline" className="mt-2">
              {book.series}
            </Badge>
          )}

          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>{formatDuration(totalDuration)}</span>
            <span>·</span>
            <span>
              {book.parts.length} {book.parts.length === 1 ? "part" : "parts"}
            </span>
            {book.ebooks.length > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  EPUB loaded
                </span>
              </>
            )}
            {(book.bookmarks?.length ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Bookmark className="size-3.5" />
                  {book.bookmarks!.length}
                </span>
              </>
            )}
          </div>

          {pct > 0.5 && (
            <div className="mt-4 max-w-sm">
              <Progress value={pct} className="h-1.5" />
              <p className="text-muted-foreground mt-1.5 text-xs">
                {Math.round(pct)}% · {formatDuration(Math.max(0, totalDuration - listened))} left
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {resumePart && (
              <Button asChild>
                <Link href={`/book/${book.id}/play/${resumePart.id}`}>
                  <Play className="size-4" />
                  {pct > 0.5 ? "Resume" : "Start listening"}
                </Link>
              </Button>
            )}
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {book.ebooks.length > 0 ? "Replace ebook" : "Load ebook"}
            </Button>
            <CalibrePicker
              bookId={book.id}
              bookTitle={book.title}
              bookAuthor={book.author}
              onImported={() => router.refresh()}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".epub"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadEbook(f);
                e.target.value = "";
              }}
            />
            <Button variant="ghost" onClick={tidyTitle} disabled={tidying} className="text-muted-foreground">
              {tidying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Tidy title
            </Button>
            <Button variant="ghost" onClick={deleteBook} className="text-muted-foreground">
              <Trash2 className="size-4" />
              Remove
            </Button>
          </div>
        </div>
      </div>

      <Separator className="my-8" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-medium">Parts</h2>
            <div className="space-y-2">
              {book.parts.map((p, i) => {
                const partPct = p.duration > 0 ? (p.positionSec / p.duration) * 100 : 0;
                return (
                  <Card key={p.id} className="flex flex-row items-center gap-3 p-3">
                    <span className="text-muted-foreground w-5 shrink-0 text-center text-sm tabular-nums">
                      {i + 1}
                    </span>
                    <Link
                      href={`/book/${book.id}/play/${p.id}`}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <p className="truncate text-sm font-medium">
                        {parseAudiobookTitle(p.title, p.channel).partLabel ?? p.title}
                      </p>
                      <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                        <span>{formatDuration(p.duration)}</span>
                        {(p.chapters?.length ?? 0) > 0 && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                            {p.chapters!.length} chapters
                          </Badge>
                        )}
                        {p.completed ? (
                          <span className="text-primary">Finished</span>
                        ) : (
                          p.positionSec > 5 && <span>at {formatTime(p.positionSec)}</span>
                        )}
                      </div>
                      {!p.completed && partPct > 0.5 && (
                        <Progress value={partPct} className="mt-2 h-1" />
                      )}
                    </Link>
                    <Button asChild size="icon" variant="ghost" className="shrink-0">
                      <Link href={`/book/${book.id}/play/${p.id}`}>
                        <Play className="size-4" />
                      </Link>
                    </Button>
                  </Card>
                );
              })}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (partUrl.trim()) addPart(partUrl.trim());
              }}
              className="mt-3 flex gap-2"
            >
              <Input
                value={partUrl}
                onChange={(e) => setPartUrl(e.target.value)}
                placeholder="Paste the next part's YouTube link…"
                className="h-9 text-sm"
              />
              <Button type="submit" size="sm" disabled={addingPart || !partUrl.trim()} className="h-9">
                {addingPart ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add part
              </Button>
            </form>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-medium">Find the next parts</h2>
              <Button size="sm" variant="secondary" onClick={findMoreParts} disabled={loadingSuggestions}>
                {loadingSuggestions ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Look up
              </Button>
            </div>

            {!suggestions && !loadingSuggestions && (
              <p className="text-muted-foreground text-sm">
                Searches YouTube for other parts of this book and videos from the same narrator — so
                you never have to leave the app to continue.
              </p>
            )}

            {suggestions && (
              <div className="space-y-6">
                <SuggestionGroup
                  title="Likely other parts"
                  hits={suggestions.sameSeries}
                  onAdd={addPart}
                  busy={addingPart}
                />
                <SuggestionGroup
                  title="Related listening"
                  hits={suggestions.related}
                  onAdd={addPart}
                  busy={addingPart}
                />
              </div>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-medium">
              <ShoppingCart className="size-4" />
              Own this book
            </h2>
            <p className="text-muted-foreground mb-3 text-sm">
              If you&apos;re enjoying it, these open a search for the title on each store.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {links.map((l) => (
                <Button key={l.name} asChild variant="outline" size="sm" className="justify-between">
                  <a href={l.url} target="_blank" rel="noreferrer noopener">
                    {l.name}
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              ))}
            </div>
          </section>

          {book.ebooks.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium">Ebook</h2>
              {book.ebooks.map((e) => (
                <Card key={e.id} className="flex flex-row items-center gap-3 p-3">
                  <FileText className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{e.fileName}</p>
                    {e.progress > 0 && (
                      <p className="text-muted-foreground text-xs">
                        {Math.round(e.progress * 100)}% read
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    onClick={async () => {
                      await fetch(`/api/ebooks/${e.id}`, { method: "DELETE" });
                      toast.success("Ebook removed");
                      router.refresh();
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </Card>
              ))}
            </section>
          )}

          {(book.bookmarks?.length ?? 0) > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium">Bookmarks</h2>
              <div className="space-y-1">
                {book.bookmarks!.slice(0, 8).map((b) => (
                  <Link
                    key={b.id}
                    href={`/book/${book.id}/play/${b.partId}`}
                    className="hover:bg-accent/50 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <span className="text-primary font-mono text-xs tabular-nums">
                      {formatTime(b.timeSec)}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {b.label ?? "Bookmark"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestionGroup({
  title,
  hits,
  onAdd,
  busy,
}: {
  title: string;
  hits: SearchHit[];
  onAdd: (url: string) => void;
  busy: boolean;
}) {
  if (hits.length === 0) return null;
  return (
    <div>
      <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      <div className="space-y-2">
        {hits.slice(0, 8).map((h) => (
          <Card key={h.videoId} className="flex flex-row items-center gap-3 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={h.thumbUrl} alt="" className="bg-muted h-12 w-20 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs leading-snug">{h.title}</p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {h.channel} · {h.durationText}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              disabled={busy}
              onClick={() => onAdd(`https://www.youtube.com/watch?v=${h.videoId}`)}
            >
              <Plus className="size-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
