"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Headphones,
  ListTree,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Sparkles,
  Timer,
  Video,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { parseAudiobookTitle } from "@/lib/title";
import { Cover } from "@/components/cover";
import { usePlayer } from "@/components/player-provider";
import { TranscriptPanel } from "@/components/transcript-panel";
import { EbookReader } from "@/components/ebook-reader";
import { RecapPanel } from "@/components/recap-panel";
import type { Book, Bookmark as BookmarkType, Chapter } from "@/lib/types";

const RATES = [0.75, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function PlayerClient({ book, initialPartId }: { book: Book; initialPartId: string }) {
  const router = useRouter();
  const [partId, setPartId] = useState(initialPartId);
  const part = book.parts.find((p) => p.id === partId) ?? book.parts[0];
  const partIndex = book.parts.findIndex((p) => p.id === part.id);
  const nextPart = book.parts[partIndex + 1];
  const prevPart = book.parts[partIndex - 1];

  const [bookmarks, setBookmarks] = useState<BookmarkType[]>(book.bookmarks ?? []);
  const [chapters, setChapters] = useState<Chapter[]>(part.chapters ?? []);
  const [detecting, setDetecting] = useState(false);
  // Audio-first by default: the cover view is the point, the video is incidental.
  const [audioOnly, setAudioOnly] = useState(true);
  const startAt = useRef(part.positionSec).current;

  // Read after mount so the server render and first client render agree.
  //
  // A new key on purpose: the old one was written on every mount, so it recorded "video"
  // as a preference for people who had never touched the toggle. Only an explicit toggle
  // writes now, and an unset value keeps the audio-first default.
  useEffect(() => {
    const stored = window.localStorage.getItem("shelf:audioOnly.v2");
    if (stored !== null) setAudioOnly(stored === "1");
  }, []);

  function toggleAudioOnly() {
    // The write has to happen outside the updater: StrictMode double-invokes updaters to
    // surface impurity, and a side effect in there left the toggle doing nothing at all.
    const next = !audioOnly;
    setAudioOnly(next);
    window.localStorage.setItem("shelf:audioOnly.v2", next ? "1" : "0");
  }

  useEffect(() => {
    setChapters(part.chapters ?? []);
  }, [part.id, part.chapters]);

  async function detectChapters() {
    setDetecting(true);
    try {
      const res = await fetch(`/api/parts/${part.id}/chapters`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not detect chapters");
      setChapters(data.chapters);
      toast.success(`Found ${data.found} chapters in the narration`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDetecting(false);
    }
  }

  const {
    state,
    seekTo,
    toggle,
    setRate,
    rate,
    sleepAt,
    setSleepTimer,
    nudge,
    load,
    setAnchor,
    setVideoHidden,
  } = usePlayer();

  // The iframe lives above this page in the provider, so it has to be told to hide.
  useEffect(() => {
    setVideoHidden(audioOnly);
    return () => setVideoHidden(false);
  }, [audioOnly, setVideoHidden]);

  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Hand the video slot to the provider, and release it when leaving the page so the
  // player falls back to the docked mini bar instead of hovering over nothing.
  useEffect(() => {
    setAnchor(anchorRef.current);
    return () => setAnchor(null);
  }, [setAnchor, partId]);

  useEffect(() => {
    load({
      bookId: book.id,
      partId: part.id,
      videoId: part.videoId,
      bookTitle: book.title,
      partTitle: part.title,
      coverUrl: book.coverUrl,
      startAt,
    });
  }, [load, book.id, book.title, book.coverUrl, part.id, part.videoId, part.title, startAt]);

  const duration = state.duration || part.duration;

  const activeChapter = useMemo(() => {
    let found: Chapter | null = null;
    for (const c of chapters) {
      if (c.startSec <= state.currentTime + 0.25) found = c;
      else break;
    }
    return found;
  }, [chapters, state.currentTime]);

  const saveProgress = useCallback(
    (position: number, completed = false) => {
      fetch(`/api/parts/${part.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSec: position,
          completed,
          ...(state.duration ? { duration: Math.round(state.duration) } : {}),
        }),
      }).catch(() => {});
    },
    [part.id, state.duration],
  );

  useEffect(() => {
    if (!state.ready) return;
    const id = window.setInterval(() => {
      if (state.playing) saveProgress(state.currentTime);
    }, 5000);
    return () => window.clearInterval(id);
  }, [state.ready, state.playing, state.currentTime, saveProgress]);

  useEffect(() => {
    const onLeave = () => saveProgress(state.currentTime);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, [saveProgress, state.currentTime]);

  useEffect(() => {
    if (!state.ended) return;
    saveProgress(duration, true);
    if (nextPart) {
      toast.success("Starting the next part…");
      goToPart(nextPart.id);
    } else {
      toast.success("You finished this book.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ended]);

  function goToPart(id: string) {
    saveProgress(state.currentTime);
    setPartId(id);
    router.replace(`/book/${book.id}/play/${id}`);
  }

  async function addBookmark() {
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: book.id,
        partId: part.id,
        timeSec: state.currentTime,
        label: activeChapter?.title ?? null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setBookmarks((b) => [data.bookmark, ...b]);
      toast.success(`Bookmarked at ${formatTime(state.currentTime)}`);
    } else {
      toast.error("Could not save bookmark");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        nudge(-15);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        nudge(30);
      } else if (e.key.toLowerCase() === "b") {
        addBookmark();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggle, nudge, state.currentTime, activeChapter]);

  const chapterRemaining = useMemo(() => {
    if (!activeChapter) return null;
    const idx = chapters.findIndex((c) => c.id === activeChapter.id);
    const end = chapters[idx + 1]?.startSec ?? duration;
    return Math.max(0, end - state.currentTime);
  }, [activeChapter, chapters, duration, state.currentTime]);

  const ebook = book.ebooks[0];
  const progressPct = duration > 0 ? (state.currentTime / duration) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5">
      <div className="mb-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href={`/book/${book.id}`}>
            <ArrowLeft className="size-4" />
            {book.title}
          </Link>
        </Button>
        {book.parts.length > 1 && (
          <Badge variant="secondary">
            Part {partIndex + 1} of {book.parts.length}
          </Badge>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="bg-muted relative overflow-hidden rounded-xl ring-1 ring-white/5">
            {/* The iframe must stay mounted in audio-only mode — unmounting it stops
                playback — so it is covered rather than removed. */}
            <div ref={anchorRef} className="aspect-video" />

            {audioOnly && (
              <div className="bg-background absolute inset-0 flex flex-col items-center justify-center gap-4">
                {/* The jacket, blurred, lights the pane — the same treatment as the home
                    hero, so a book colours its own player. */}
                {book.coverUrl && (
                  <>
                    <div
                      aria-hidden
                      className="absolute inset-0 scale-125 bg-cover bg-center opacity-40 blur-3xl saturate-150"
                      style={{ backgroundImage: `url(${book.coverUrl})` }}
                    />
                    <div
                      aria-hidden
                      className="from-background/70 via-background/40 to-background/80 absolute inset-0 bg-gradient-to-b"
                    />
                  </>
                )}
                <Cover
                  src={book.coverUrl}
                  className={cn(
                    "relative h-64 w-44 rounded-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-700",
                    state.playing ? "scale-100" : "scale-95 opacity-80",
                  )}
                />
                <div className="relative flex items-end gap-1 h-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "bg-primary/70 w-1 rounded-full",
                        state.playing ? "animate-pulse" : "opacity-30",
                      )}
                      style={{
                        height: state.playing ? `${[40, 75, 100, 60, 30][i]}%` : "20%",
                        animationDelay: `${i * 120}ms`,
                        animationDuration: "900ms",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <Button
              size="sm"
              variant="secondary"
              // The iframe host is `fixed z-50` and lives outside this tree, so anything below
              // that sits under the video and becomes unreachable in video mode.
              className="absolute top-2 right-2 z-[60] h-8 gap-1.5 text-xs opacity-80 hover:opacity-100"
              onClick={toggleAudioOnly}
            >
              {audioOnly ? <Video className="size-3.5" /> : <Headphones className="size-3.5" />}
              {audioOnly ? "Show video" : "Audio only"}
            </Button>
          </div>

          <div>
            <h1 className="text-xl leading-snug font-medium">
              {parseAudiobookTitle(part.title, part.channel).partLabel ?? part.title}
            </h1>
            <p className="text-subtle-foreground mt-0.5 text-sm">{book.title}</p>
            {activeChapter && (
              <p className="text-primary mt-1 text-sm">{activeChapter.title}</p>
            )}
          </div>

          <div>
            {/* A 6px bar is a hard target to hit. The padded wrapper gives it a ~20px
                grab area while the visible bar stays slim. */}
            <div
              className="group relative -my-2 w-full cursor-pointer py-2"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seekTo(((e.clientX - rect.left) / rect.width) * duration);
              }}
            >
              <div className="bg-secondary relative h-1.5 w-full overflow-hidden rounded-full transition-all group-hover:h-2.5">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
                {chapters.map((c) => (
                  <span
                    key={c.id}
                    className="bg-background/70 absolute top-0 h-full w-px"
                    style={{ left: `${duration > 0 ? (c.startSec / duration) * 100 : 0}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs tabular-nums">
              <span>{formatTime(state.currentTime)}</span>
              {chapterRemaining !== null && (
                <span className="text-muted-foreground">
                  {formatTime(chapterRemaining)} left in chapter
                </span>
              )}
              <span>-{formatTime(Math.max(0, duration - state.currentTime))}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={!prevPart}
              onClick={() => prevPart && goToPart(prevPart.id)}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => nudge(-15)}>
              <RotateCcw className="size-6" />
            </Button>
            <Button size="icon" className="size-16 rounded-full" onClick={toggle}>
              {state.playing ? <Pause className="size-7" /> : <Play className="size-7" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => nudge(30)}>
              <RotateCw className="size-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!nextPart}
              onClick={() => nextPart && goToPart(nextPart.id)}
            >
              <ChevronRight className="size-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="ml-2 tabular-nums">
                  {rate}×
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {RATES.map((r) => (
                  <DropdownMenuItem key={r} onClick={() => setRate(r)}>
                    {r}×
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={sleepAt ? "default" : "secondary"}
                  size="sm"
                  className="gap-1.5 tabular-nums"
                >
                  <Timer className="size-4" />
                  {sleepAt ? `${Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000))}m` : "Sleep"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {[10, 15, 30, 45, 60].map((m) => (
                  <DropdownMenuItem key={m} onClick={() => setSleepTimer(m)}>
                    {m} minutes
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setSleepTimer(null)}>Off</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="secondary" size="sm" className="gap-1.5" onClick={addBookmark}>
              <Bookmark className="size-4" />
              Bookmark
            </Button>
          </div>

          {nextPart && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => goToPart(nextPart.id)}
            >
              <SkipForward className="size-4" />
              <span className="truncate">Up next: {nextPart.title}</span>
            </Button>
          )}
        </div>

        <div className="bg-card/40 h-[78vh] min-h-[520px] overflow-hidden rounded-xl border">
          <Tabs defaultValue="chapters" className="flex h-full flex-col gap-0">
            <TabsList className="m-2 grid grid-cols-5">
              <TabsTrigger value="chapters" className="gap-1.5 text-xs">
                <ListTree className="size-3.5" />
                Chapters
              </TabsTrigger>
              <TabsTrigger value="recap" className="gap-1.5 text-xs">
                <Sparkles className="size-3.5" />
                Recap
              </TabsTrigger>
              <TabsTrigger value="transcript" className="gap-1.5 text-xs">
                <FileText className="size-3.5" />
                Transcript
              </TabsTrigger>
              <TabsTrigger value="ebook" className="gap-1.5 text-xs">
                <BookOpen className="size-3.5" />
                Ebook
              </TabsTrigger>
              <TabsTrigger value="bookmarks" className="gap-1.5 text-xs">
                <Bookmark className="size-3.5" />
                Marks
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chapters" className="min-h-0 flex-1 overflow-y-auto p-2">
              <ChapterList
                chapters={chapters}
                activeId={activeChapter?.id ?? null}
                onSeek={seekTo}
                duration={duration}
                onDetect={detectChapters}
                detecting={detecting}
              />
            </TabsContent>

            <TabsContent value="recap" className="min-h-0 flex-1">
              <RecapPanel partId={part.id} currentTime={state.currentTime} onSeek={seekTo} />
            </TabsContent>

            <TabsContent value="transcript" className="min-h-0 flex-1">
              <TranscriptPanel
                videoId={part.videoId}
                currentTime={state.currentTime}
                onSeek={seekTo}
              />
            </TabsContent>

            <TabsContent value="ebook" className="min-h-0 flex-1">
              {ebook ? (
                <EbookReader
                  ebook={ebook}
                  partId={part.id}
                  videoId={part.videoId}
                  currentTime={state.currentTime}
                  onSeek={seekTo}
                />
              ) : (
                <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm">
                  <BookOpen className="size-8 opacity-40" />
                  <p>No ebook loaded for this book yet.</p>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/book/${book.id}`}>Upload an EPUB</Link>
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="bookmarks" className="min-h-0 flex-1 overflow-y-auto p-2">
              <BookmarkList
                bookmarks={bookmarks}
                currentPartId={part.id}
                onSeek={seekTo}
                onJumpPart={goToPart}
                onDelete={async (id) => {
                  setBookmarks((b) => b.filter((x) => x.id !== id));
                  await fetch(`/api/bookmarks/${id}`, { method: "DELETE" }).catch(() => {});
                }}
                onSaveNote={async (id, note) => {
                  setBookmarks((list) =>
                    list.map((x) => (x.id === id ? { ...x, note: note || null } : x)),
                  );
                  await fetch(`/api/bookmarks/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ note }),
                  }).catch(() => {});
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function ChapterList({
  chapters,
  activeId,
  onSeek,
  duration,
  onDetect,
  detecting,
}: {
  chapters: Chapter[];
  activeId: string | null;
  onSeek: (s: number) => void;
  duration: number;
  onDetect: () => void;
  detecting: boolean;
}) {
  if (chapters.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm">
        <ListTree className="size-8 opacity-40" />
        <p>This video has no chapter markers.</p>
        <p className="text-xs">
          If the narrator announces chapters aloud, they can be picked out of the transcript.
        </p>
        <Button size="sm" variant="secondary" onClick={onDetect} disabled={detecting}>
          {detecting ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Find chapters from narration
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex justify-end px-1 pb-1">
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-8 gap-1.5 text-xs"
          onClick={onDetect}
          disabled={detecting}
        >
          {detecting ? <Loader2 className="size-3" /> : <Wand2 className="size-3" />}
          Rebuild from narration
        </Button>
      </div>
      {chapters.map((c, i) => {
        const end = chapters[i + 1]?.startSec ?? duration;
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            onClick={() => onSeek(c.startSec)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
              active ? "bg-primary/15" : "hover:bg-accent/50",
            )}
          >
            <span
              className={cn(
                "w-5 shrink-0 text-center text-xs tabular-nums",
                active ? "text-primary" : "text-subtle-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className={cn("min-w-0 flex-1 truncate text-sm", active && "text-primary font-medium")}>
              {c.title}
            </span>
            <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
              {formatTime(c.startSec)}
            </span>
            <span className="text-subtle-foreground hidden shrink-0 text-xs tabular-nums sm:inline">
              {formatTime(Math.max(0, end - c.startSec))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BookmarkList({
  bookmarks,
  currentPartId,
  onSeek,
  onJumpPart,
  onDelete,
  onSaveNote,
}: {
  bookmarks: BookmarkType[];
  currentPartId: string;
  onSeek: (s: number) => void;
  onJumpPart: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveNote: (id: string, note: string) => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
        <Bookmark className="size-8 opacity-40" />
        <p>No bookmarks yet.</p>
        <p className="text-xs">Press B while listening to drop one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {bookmarks.map((b) => (
        <div
          key={b.id}
          className="hover:bg-accent/50 group flex items-center gap-3 rounded-md px-3 py-2"
        >
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              if (b.partId !== currentPartId) onJumpPart(b.partId);
              else onSeek(b.timeSec);
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-primary font-mono text-xs tabular-nums">
                {formatTime(b.timeSec)}
              </span>
              {b.partId !== currentPartId && (
                <Badge variant="outline" className="px-1 py-0 text-xs">
                  other part
                </Badge>
              )}
            </div>
            {b.label && <p className="text-muted-foreground mt-0.5 truncate text-xs">{b.label}</p>}
          </button>
          <div className="min-w-0 flex-1">
            <BookmarkNote bookmark={b} onSave={onSaveNote} />
          </div>
          <button
            onClick={() => onDelete(b.id)}
            className="text-muted-foreground hover:text-destructive text-xs opacity-0 transition-opacity group-hover:opacity-100"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

/** Inline note editor — the `note` column existed from the start but had no UI. */
function BookmarkNote({
  bookmark,
  onSave,
}: {
  bookmark: BookmarkType;
  onSave: (id: string, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bookmark.note ?? "");

  if (!editing) {
    return bookmark.note ? (
      <button
        onClick={() => setEditing(true)}
        className="text-muted-foreground hover:text-foreground mt-1 block w-full truncate text-left text-xs italic"
      >
        {bookmark.note}
      </button>
    ) : (
      <button
        onClick={() => setEditing(true)}
        className="text-subtle-foreground hover:text-foreground mt-1 block text-left text-xs opacity-0 transition-opacity group-hover:opacity-100"
      >
        Add a note…
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (value !== (bookmark.note ?? "")) onSave(bookmark.id, value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(bookmark.note ?? "");
          setEditing(false);
        }
      }}
      placeholder="Why does this moment matter?"
      className="bg-background focus:ring-ring mt-1 w-full rounded border px-2 py-1 text-xs focus:ring-1 focus:outline-none"
    />
  );
}
