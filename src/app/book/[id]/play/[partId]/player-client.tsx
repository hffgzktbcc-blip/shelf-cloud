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
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Sparkles,
  Timer,
  Trash2,
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
  const [textMode, setTextMode] = useState<"transcript" | "ebook">("transcript");
  const startAt = useRef(part.positionSec).current;

  // Read after mount so the server render and first client render agree.
  //
  // A new key on purpose: the old one was written on every mount, so it recorded "video"
  // as a preference for people who had never touched the toggle. Only an explicit toggle
  // writes now, and an unset value keeps the audio-first default.
  useEffect(() => {
    const stored = window.localStorage.getItem("shelf:audioOnly.v2");
    const isAppleTouch =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isAppleTouch) {
      // iOS Safari will not reliably start a hidden cross-origin media iframe.
      // Keep the YouTube surface visible so the first tap remains a real media gesture.
      setAudioOnly(false);
    } else if (stored !== null) {
      setAudioOnly(stored === "1");
    }
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
    setNowPlayingLabel,
    prefs,
    playerError,
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
      // Step back a little when picking a part up again — it re-finds the thread. Only
      // once you're genuinely into it, never at the very start.
      startAt:
        startAt > 60 ? Math.max(0, startAt - prefs.rewindOnResume) : startAt,
    });
  }, [
    load,
    book.id,
    book.title,
    book.coverUrl,
    part.id,
    part.videoId,
    part.title,
    startAt,
    prefs.rewindOnResume,
  ]);

  const duration = state.duration || part.duration;

  const activeChapter = useMemo(() => {
    let found: Chapter | null = null;
    for (const c of chapters) {
      if (c.startSec <= state.currentTime + 0.25) found = c;
      else break;
    }
    return found;
  }, [chapters, state.currentTime]);

  // The docked bar can't know which chapter is playing, so hand it over.
  useEffect(() => {
    setNowPlayingLabel(activeChapter?.title ?? null);
    return () => setNowPlayingLabel(null);
  }, [activeChapter?.title, setNowPlayingLabel]);

  const saveProgress = useCallback(
    (position: number, completed = false) => {
      fetch(`/api/parts/${part.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSec: position,
          rate,
          completed,
          ...(state.duration ? { duration: Math.round(state.duration) } : {}),
        }),
      }).catch(() => {});
    },
    [part.id, state.duration, rate],
  );

  useEffect(() => {
    if (!state.ready || !state.playing) return;
    const id = window.setInterval(() => {
      latest.current.save(latest.current.time);
    }, 5000);
    return () => window.clearInterval(id);
  }, [state.ready, state.playing]);

  // Save on the way out, and only on the way out. This previously depended on
  // state.currentTime, so it tore down and re-ran four times a second — and its cleanup
  // saves, which meant a network write per poll tick and sub-second deltas that the
  // crediting logic rounded to zero. The position is read from a ref so the effect can
  // hold still.
  const latest = useRef({ time: 0, save: saveProgress });
  useEffect(() => {
    latest.current = { time: state.currentTime, save: saveProgress };
  });

  useEffect(() => {
    const onLeave = () => latest.current.save(latest.current.time);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, []);

  useEffect(() => {
    if (!state.ended) return;
    saveProgress(duration, true);
    if (nextPart && prefs.autoPlayNext) {
      toast.success("Starting the next part…");
      goToPart(nextPart.id);
    } else if (!nextPart) {
      toast.success("You finished this book.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ended, prefs.autoPlayNext]);

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
        nudge(-prefs.skipBack);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        nudge(prefs.skipForward);
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

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="bg-muted relative overflow-hidden rounded-xl ring-1 ring-white/5">
            {/* The iframe must stay mounted in audio-only mode — unmounting it stops
                playback — so it is covered rather than removed. */}
            <div ref={anchorRef} className="aspect-video w-full max-w-full" />

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
                    "relative h-64 w-44 rounded-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-300",
                    state.playing ? "scale-100" : "scale-95 opacity-80",
                  )}
                />
                <div className="relative flex items-end gap-1 h-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "bg-muted-foreground/60 w-1 rounded-full",
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
              <p className="text-position mt-1 text-sm">{activeChapter.title}</p>
            )}
          </div>

          <div>
            {/* Chapter ticks were 1px lines at 70% background: on a long part with forty
                chapters that is forty hairlines a few pixels apart, invisible on a 6px
                track and impossible to aim at. The track is segmented by chapter instead,
                so chapters are the thing being scrubbed rather than marks drawn over it. */}
            <ChapterTrack
              chapters={chapters}
              duration={duration}
              currentTime={state.currentTime}
              activeId={activeChapter?.id ?? null}
              onSeek={seekTo}
            />
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
            <Button variant="ghost" size="icon" onClick={() => nudge(-prefs.skipBack)} aria-label={`Back ${prefs.skipBack} seconds`}>
              <RotateCcw className="size-6" />
            </Button>
            <Button
              size="icon"
              className="size-16 rounded-full"
              onClick={toggle}
              aria-label={state.ready ? (state.playing ? "Pause" : "Play") : "Loading player"}
            >
              {playerError ? (
                <span className="text-xs">Open</span>
              ) : !state.ready ? (
                <Loader2 className="size-7 animate-spin" />
              ) : state.playing ? (
                <Pause className="size-7" />
              ) : (
                <Play className="size-7" />
              )}
            </Button>
            {playerError && (
              <a
                href={`https://www.youtube.com/watch?v=${part.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              >
                YouTube
              </a>
            )}
            <Button variant="ghost" size="icon" onClick={() => nudge(prefs.skipForward)} aria-label={`Forward ${prefs.skipForward} seconds`}>
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
                  {[prefs.sleepDefaultMin, ...[10, 15, 30, 45, 60].filter((m) => m !== prefs.sleepDefaultMin)].map((m) => (
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

        {/* Fill the window rather than a fixed fraction of it: at 78vh the panel stopped
            short of the fold on every screen, leaving a dead band under the player. */}
        <div className="bg-card/50 h-[70vh] min-h-[420px] md:h-[calc(100vh-8.5rem)] md:min-h-[520px] overflow-hidden rounded-xl border">
          <Tabs defaultValue="chapters" className="flex h-full flex-col gap-0">
            <TabsList className="m-2 grid grid-cols-3">
              <TabsTrigger value="chapters" className="gap-1.5 text-xs">
                <ListTree className="size-3.5" />
                Chapters
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-1.5 text-xs">
                <FileText className="size-3.5" />
                Text
              </TabsTrigger>
              <TabsTrigger value="bookmarks" className="gap-1.5 text-xs">
                <Bookmark className="size-3.5" />
                Bookmarks
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chapters" className="min-h-0 flex-1 overflow-y-auto p-2">
              <RecapPanel
                partId={part.id}
                currentTime={state.currentTime}
                onSeek={seekTo}
                compact
              />
              <ChapterList
                chapters={chapters}
                activeId={activeChapter?.id ?? null}
                onSeek={seekTo}
                duration={duration}
                onDetect={detectChapters}
                detecting={detecting}
              />
            </TabsContent>

            <TabsContent value="text" className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-1 border-b px-2 py-1.5">
                {(["transcript", "ebook"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTextMode(mode)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors",
                      textMode === mode
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode === "transcript" ? "Transcript" : "Ebook"}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1">
                {textMode === "transcript" ? (
                  <TranscriptPanel
                    videoId={part.videoId}
                    currentTime={state.currentTime}
                    onSeek={seekTo}
                  />
                ) : ebook ? (
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
              </div>
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
              active ? "bg-position/15" : "hover:bg-accent/50",
            )}
          >
            <span
              className={cn(
                "w-5 shrink-0 text-center text-xs tabular-nums",
                active ? "text-position" : "text-subtle-foreground",
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
          className="hover:bg-accent/50 group rounded-md px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <button
              className="text-position font-mono text-xs tabular-nums"
              onClick={() => {
                if (b.partId !== currentPartId) onJumpPart(b.partId);
                else onSeek(b.timeSec);
              }}
            >
              {formatTime(b.timeSec)}
            </button>
            {b.partId !== currentPartId && (
              <Badge variant="outline" className="px-1 py-0 text-xs">
                other part
              </Badge>
            )}
            {b.label && <span className="text-subtle-foreground text-xs">{b.label}</span>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground ml-auto"
                  aria-label="Bookmark actions"
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(b.id)}>
                  <Trash2 className="size-4" />
                  Remove bookmark
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {b.quote && (
            <button
              className="mt-1 block w-full text-left"
              onClick={() => {
                if (b.partId !== currentPartId) onJumpPart(b.partId);
                else onSeek(b.timeSec);
              }}
            >
              <p className="text-foreground/90 border-primary/40 border-l-2 pl-2.5 text-sm leading-relaxed">
                {b.quote}
              </p>
            </button>
          )}

          <div className="mt-1">
            <BookmarkNote bookmark={b} onSave={onSaveNote} />
          </div>
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
        className="text-subtle-foreground hover:text-foreground mt-1 block text-left text-xs italic transition-colors"
      >
        Why does this moment matter?
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
      className="bg-background focus:ring-ring mt-1 w-full rounded-md border px-2 py-1 text-xs focus:ring-1 focus:outline-none"
    />
  );
}

/**
 * The progress bar, cut into one segment per chapter with a hairline gap between them.
 * The segment under the cursor names itself; the one you are in is the only brass.
 */
function ChapterTrack({
  chapters,
  duration,
  currentTime,
  activeId,
  onSeek,
}: {
  chapters: Chapter[];
  duration: number;
  currentTime: number;
  activeId: string | null;
  onSeek: (s: number) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Without chapters there is nothing to segment, so fall back to a single bar.
  const segments =
    duration > 0 && chapters.length > 0
      ? chapters.map((c, i) => {
          const start = c.startSec;
          const end = chapters[i + 1]?.startSec ?? duration;
          return { ...c, start, end, width: ((end - start) / duration) * 100 };
        })
      : [{ id: "whole", title: "", start: 0, end: duration, width: 100 } as const];

  const hoveredChapter = segments.find((s) => s.id === hovered);

  return (
    <div>
      <div className="group flex h-6 w-full items-center gap-[2px]">
        {segments.map((seg) => {
          const filled =
            currentTime <= seg.start
              ? 0
              : currentTime >= seg.end
                ? 100
                : ((currentTime - seg.start) / (seg.end - seg.start)) * 100;
          const isActive = seg.id === activeId;

          return (
            <button
              key={seg.id}
              onMouseEnter={() => setHovered(seg.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const within = (e.clientX - r.left) / r.width;
                onSeek(seg.start + within * (seg.end - seg.start));
              }}
              style={{ width: `${seg.width}%` }}
              className="relative h-1.5 min-w-[3px] overflow-hidden rounded-[2px] transition-all group-hover:h-2.5"
              aria-label={seg.title || "Seek"}
            >
              <span className="bg-secondary absolute inset-0" />
              <span
                className={cn(
                  "absolute inset-y-0 left-0 transition-[width]",
                  isActive ? "bg-position" : "bg-muted-foreground/70",
                )}
                style={{ width: `${filled}%` }}
              />
            </button>
          );
        })}
      </div>

      {/* Reserve the row so naming a chapter on hover doesn't shift the transport. */}
      <p className="text-muted-foreground mt-1 h-4 truncate text-xs">
        {hoveredChapter?.title ?? ""}
      </p>
    </div>
  );
}
