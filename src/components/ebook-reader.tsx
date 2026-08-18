"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, ListTree, Loader2, LocateFixed, Minus, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { Ebook, SyncMark } from "@/lib/types";

type Block = { index: number; kind: "heading" | "para"; text: string; chapter: number };
type Chapter = { index: number; title: string; firstBlock: number };

type ReadingTheme = "dark" | "sepia" | "paper";

/** Reading surfaces, matching what e-readers offer: night, warm, and plain paper. */
const THEMES: Record<ReadingTheme, { label: string; surface: string; body: string; heading: string }> = {
  dark: {
    label: "Night",
    surface: "bg-transparent",
    body: "text-foreground/85",
    heading: "text-foreground",
  },
  sepia: {
    label: "Sepia",
    surface: "bg-[#f4ecd8]",
    body: "text-[#4a3f35]",
    heading: "text-[#2f2721]",
  },
  paper: {
    label: "Paper",
    surface: "bg-[#fbfbf9]",
    body: "text-[#33322e]",
    heading: "text-[#16150f]",
  },
};

type Props = {
  ebook: Ebook;
  partId: string;
  videoId: string;
  currentTime: number;
  onSeek: (seconds: number) => void;
};

/**
 * Renders the book as ordinary app DOM instead of epub.js's iframe. That is what makes the
 * text theme-able (the publisher's stylesheet was black-on-dark and unreadable), every
 * paragraph clickable, and the current position highlightable rather than paged to.
 */
export function EbookReader({ ebook, partId, videoId, currentTime, onSeek }: Props) {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(17);
  const [theme, setTheme] = useState<ReadingTheme>("dark");
  const [serif, setSerif] = useState(true);
  const [marks, setMarks] = useState<SyncMark[]>(ebook.syncMarks ?? []);
  const [following, setFollowing] = useState(true);
  const [aligning, setAligning] = useState(false);
  const [alignStatus, setAlignStatus] = useState<string | null>(null);
  const [showContents, setShowContents] = useState(false);
  const [manualBlock, setManualBlock] = useState<number | null>(null);

  // Remember reading preferences across sessions.
  useEffect(() => {
    const t = window.localStorage.getItem("shelf:readTheme") as ReadingTheme | null;
    if (t && t in THEMES) setTheme(t);
    const f = window.localStorage.getItem("shelf:readSize");
    if (f) setFontSize(Number(f));
    const sf = window.localStorage.getItem("shelf:readSerif");
    if (sf !== null) setSerif(sf === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("shelf:readTheme", theme);
    window.localStorage.setItem("shelf:readSize", String(fontSize));
    window.localStorage.setItem("shelf:readSerif", serif ? "1" : "0");
  }, [theme, fontSize, serif]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const lastScrolledTo = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ebooks/${ebook.id}/content`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else {
          setBlocks(d.blocks);
          setChapters(d.chapters ?? []);
          if (typeof d.blockIndex === "number" && d.blockIndex > 0) setManualBlock(d.blockIndex);
        }
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ebook.id]);

  const partMarks = useMemo(
    () =>
      marks
        .filter((m) => m.partId === partId && m.blockIndex != null)
        .sort((a, b) => a.timeSec - b.timeSec),
    [marks, partId],
  );

  /** Interpolates between the surrounding anchors so the highlight advances between them. */
  const syncedBlock = useMemo(() => {
    if (partMarks.length === 0) return null;
    let prev = partMarks[0];
    let next: SyncMark | null = null;
    for (const m of partMarks) {
      if (m.timeSec <= currentTime) prev = m;
      else {
        next = m;
        break;
      }
    }
    if (!next) return prev.blockIndex!;
    const span = next.timeSec - prev.timeSec;
    const frac = span > 0 ? (currentTime - prev.timeSec) / span : 0;
    return Math.round(prev.blockIndex! + frac * (next.blockIndex! - prev.blockIndex!));
  }, [partMarks, currentTime]);

  const activeBlock = following && syncedBlock !== null ? syncedBlock : manualBlock;

  useEffect(() => {
    if (!following || activeBlock === null) return;
    if (lastScrolledTo.current === activeBlock) return;
    lastScrolledTo.current = activeBlock;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeBlock, following]);

  const savePosition = useCallback(
    (index: number) => {
      fetch(`/api/ebooks/${ebook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockIndex: index,
          progress: blocks && blocks.length > 0 ? index / blocks.length : 0,
        }),
      }).catch(() => {});
    },
    [ebook.id, blocks],
  );

  /** Clicking a paragraph moves the audio to it — the inverse of following. */
  function onBlockClick(index: number) {
    setManualBlock(index);
    savePosition(index);

    if (partMarks.length === 0) {
      toast.info("Run Auto-sync first to jump the audio from the text.");
      return;
    }
    let before = partMarks[0];
    let after: SyncMark | null = null;
    for (const m of partMarks) {
      if (m.blockIndex! <= index) before = m;
      else {
        after = m;
        break;
      }
    }
    let seconds = before.timeSec;
    if (after && after.blockIndex! !== before.blockIndex!) {
      const frac = (index - before.blockIndex!) / (after.blockIndex! - before.blockIndex!);
      seconds = before.timeSec + frac * (after.timeSec - before.timeSec);
    }
    onSeek(Math.max(0, seconds));
    toast.success(`Jumped to ${formatTime(seconds)}`);
  }

  async function autoSync() {
    if (!blocks) return;
    setAligning(true);
    setAlignStatus("Fetching the narration…");
    try {
      const res = await fetch(`/api/youtube/transcript/${videoId}`);
      const data = await res.json();
      const cues = data.cues ?? [];
      if (cues.length === 0) throw new Error("This recording has no transcript to align against.");

      setAlignStatus("Matching narration to the text…");
      await new Promise((r) => setTimeout(r, 30));

      const { alignTranscriptToBook } = await import("@/lib/align");
      const alignBlocks = blocks.map((b) => ({
        chars: b.text.length,
        tokens: b.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean),
      }));
      const points = alignTranscriptToBook(cues, alignBlocks);
      if (points.length === 0) throw new Error("No confident matches — this may be a different edition.");

      setAlignStatus("Saving…");
      const saveRes = await fetch("/api/syncmarks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ebookId: ebook.id,
          partId,
          replace: true,
          marks: points.map((p) => ({ timeSec: p.timeSec, blockIndex: p.blockIndex })),
        }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.error ?? "Could not save sync points");

      setMarks(saved.syncMarks);
      setFollowing(true);
      toast.success(`Aligned ${points.length} points across the book`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAligning(false);
      setAlignStatus(null);
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Opening your book…
      </div>
    );
  }

  if (error || !blocks) {
    return (
      <div className="text-destructive flex h-full items-center justify-center px-6 text-center text-sm">
        {error ?? "Could not read this EPUB."}
      </div>
    );
  }

  const currentChapter =
    activeBlock !== null ? chapters[blocks[activeBlock]?.chapter ?? 0] : chapters[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-9 gap-1.5 px-2 text-xs"
          onClick={() => setShowContents((v) => !v)}
        >
          <ListTree className="size-3.5" />
          Contents
        </Button>

        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            onClick={() => setFontSize((f) => Math.max(13, f - 1))}
            aria-label="Smaller text"
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="text-muted-foreground w-7 text-center text-xs tabular-nums">
            {fontSize}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            onClick={() => setFontSize((f) => Math.min(26, f + 1))}
            aria-label="Larger text"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-9 px-2 text-xs"
          onClick={() => setSerif((v) => !v)}
          title="Toggle serif"
        >
          <span className={serif ? "font-serif" : "font-sans"}>Aa</span>
        </Button>

        <div className="flex items-center gap-0.5">
          {(Object.keys(THEMES) as ReadingTheme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              title={THEMES[t].label}
              aria-label={THEMES[t].label}
              className={cn(
                "size-6 rounded-full border transition-all",
                t === "dark" && "bg-neutral-900",
                t === "sepia" && "bg-[#f4ecd8]",
                t === "paper" && "bg-[#fbfbf9]",
                theme === t ? "ring-primary scale-110 ring-2" : "border-border/60 hover:scale-105",
              )}
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5 px-2 text-xs"
            onClick={autoSync}
            disabled={aligning}
          >
            {aligning ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            Auto-sync
          </Button>
          <Button
            size="sm"
            variant={following ? "default" : "secondary"}
            className="h-9 px-2.5 text-xs"
            disabled={partMarks.length === 0}
            onClick={() => {
              setFollowing((v) => !v);
              lastScrolledTo.current = null;
            }}
          >
            {following ? "Following" : "Follow"}
          </Button>
        </div>
      </div>

      {alignStatus && (
        <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" />
          {alignStatus}
        </div>
      )}

      {partMarks.length > 0 && !alignStatus && (
        <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 text-xs">
          <Link2 className="size-3" />
          {partMarks.length} sync points
          {currentChapter && <span className="truncate">· {currentChapter.title}</span>}
          <button
            className="hover:text-foreground ml-auto inline-flex items-center gap-1"
            onClick={() => {
              lastScrolledTo.current = null;
              activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
          >
            <LocateFixed className="size-3" />
            Jump to now
          </button>
        </div>
      )}

      {showContents && (
        <div className="max-h-52 overflow-y-auto border-b p-1.5">
          {chapters.map((c) => (
            <button
              key={c.index}
              onClick={() => {
                setFollowing(false);
                setManualBlock(c.firstBlock);
                savePosition(c.firstBlock);
                setShowContents(false);
              }}
              className="hover:bg-accent/50 block w-full truncate rounded px-2 py-1.5 text-left text-xs"
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-6 transition-colors", THEMES[theme].surface)}
      >
        {/* ~62 characters is the measure long-form prose reads best at. */}
        <div className={cn("mx-auto max-w-[62ch]", serif ? "font-serif" : "font-sans")}>
          {blocks.map((b) => {
            const isActive = b.index === activeBlock;
            return b.kind === "heading" ? (
              <h3
                key={b.index}
                ref={isActive ? (activeRef as never) : undefined}
                onClick={() => onBlockClick(b.index)}
                className={cn(
                  "mt-10 mb-4 cursor-pointer scroll-mt-8 rounded-md px-2 py-1 font-semibold tracking-tight transition-colors",
                  isActive ? "bg-primary/20" : "hover:bg-black/5 dark:hover:bg-white/5",
                  THEMES[theme].heading,
                )}
                style={{ fontSize: `${fontSize + 4}px` }}
              >
                {b.text}
              </h3>
            ) : (
              <p
                key={b.index}
                ref={isActive ? activeRef : undefined}
                onClick={() => onBlockClick(b.index)}
                className={cn(
                  "-mx-2 cursor-pointer rounded-md px-2 py-1 transition-colors",
                  isActive
                    ? "bg-primary/20"
                    : cn(THEMES[theme].body, "hover:bg-black/5 dark:hover:bg-white/5"),
                )}
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
              >
                {b.text}
              </p>
            );
          })}
          <div className="h-24" />
        </div>
      </div>
    </div>
  );
}
