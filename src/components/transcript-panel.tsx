"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2, LocateFixed, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { TranscriptCue } from "@/lib/types";

type Props = {
  videoId: string;
  currentTime: number;
  onSeek: (seconds: number) => void;
};

/**
 * Audiobook transcripts run to tens of thousands of cues, so only a window around the
 * reading position is mounted — rendering them all drops playback to ~19fps.
 */
const HALF_WINDOW = 250;
const EXTEND_BY = 150;
const MAX_WINDOW = 1400;
const EDGE = 30;
const SEARCH_LIMIT = 300;

type Positioned = { cue: TranscriptCue; index: number };

/**
 * YouTube emits a caption cue every few words, which is why the transcript read as a column
 * of fragments. Grouping them back into paragraphs makes it read like the book: a new
 * paragraph starts on a real pause in the narration, or once one has run long enough.
 */
const PARAGRAPH_GAP_SEC = 1.6;
const PARAGRAPH_MAX_CHARS = 420;

function toParagraphs(items: Positioned[]): Positioned[][] {
  const out: Positioned[][] = [];
  let current: Positioned[] = [];
  let chars = 0;

  for (let i = 0; i < items.length; i++) {
    const { cue } = items[i];
    const previous = items[i - 1]?.cue;

    const gap = previous ? cue.start - (previous.start + (previous.dur ?? 0)) : 0;
    const endsSentence = previous ? /[.!?]["')\]]?\s*$/.test(previous.text) : false;
    const tooLong = chars > PARAGRAPH_MAX_CHARS;

    if (current.length > 0 && (gap > PARAGRAPH_GAP_SEC || (tooLong && endsSentence) || chars > PARAGRAPH_MAX_CHARS * 2)) {
      out.push(current);
      current = [];
      chars = 0;
    }

    current.push(items[i]);
    chars += cue.text.length + 1;
  }

  if (current.length > 0) out.push(current);
  return out;
}

export function TranscriptPanel({ videoId, currentTime, onSeek }: Props) {
  const [cues, setCues] = useState<TranscriptCue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState(true);
  const [range, setRange] = useState({ start: 0, end: 2 * HALF_WINDOW });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  const prependRef = useRef<{ height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    setCues(null);

    fetch(`/api/youtube/transcript/${videoId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.unavailable || !data.cues?.length) setUnavailable(true);
        else setCues(data.cues);
      })
      .catch(() => !cancelled && setUnavailable(true))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const activeIndex = useMemo(() => {
    if (!cues) return -1;
    let lo = 0;
    let hi = cues.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= currentTime) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }, [cues, currentTime]);

  const recenter = useCallback(
    (index: number) => {
      if (!cues) return;
      setRange({
        start: Math.max(0, index - HALF_WINDOW),
        end: Math.min(cues.length, index + HALF_WINDOW),
      });
    },
    [cues],
  );

  useEffect(() => {
    if (!cues || activeIndex < 0 || !following || query.trim()) return;
    if (activeIndex < range.start + EDGE || activeIndex > range.end - EDGE) recenter(activeIndex);
  }, [cues, activeIndex, following, query, range.start, range.end, recenter]);

  const lastScrolledTo = useRef<number | null>(null);

  useEffect(() => {
    if (!following || query.trim() || activeIndex < 0) return;

    // Every new smooth scroll cancels the one in flight, and cues advance every second or
    // two — faster at 1.5x or 2x — so the animation never lands and the text trails the
    // voice. Animate only when the position jumps; otherwise track instantly.
    const previous = lastScrolledTo.current;
    const jumped = previous === null || Math.abs(activeIndex - previous) > 20;
    lastScrolledTo.current = activeIndex;

    activeRef.current?.scrollIntoView({ block: "center", behavior: jumped ? "smooth" : "auto" });
  }, [activeIndex, following, query]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const pending = prependRef.current;
    if (!el || !pending) return;
    el.scrollTop += el.scrollHeight - pending.height;
    prependRef.current = null;
  }, [range.start]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !cues || query.trim()) return;

    if (el.scrollTop < 300 && range.start > 0) {
      prependRef.current = { height: el.scrollHeight };
      setRange((r) => ({
        start: Math.max(0, r.start - EXTEND_BY),
        end: Math.min(r.end, Math.max(0, r.start - EXTEND_BY) + MAX_WINDOW),
      }));
    } else if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 300 &&
      range.end < cues.length
    ) {
      setRange((r) => {
        const end = Math.min(cues.length, r.end + EXTEND_BY);
        return { start: Math.max(r.start, end - MAX_WINDOW), end };
      });
    }
  }, [cues, query, range.start, range.end]);

  const searchResults = useMemo(() => {
    if (!cues || !query.trim()) return null;
    const q = query.toLowerCase();
    const out: { cue: TranscriptCue; index: number }[] = [];
    for (let i = 0; i < cues.length && out.length < SEARCH_LIMIT; i++) {
      if (cues[i].text.toLowerCase().includes(q)) out.push({ cue: cues[i], index: i });
    }
    return out;
  }, [cues, query]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading transcript…
      </div>
    );
  }

  if (unavailable || !cues) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center px-6 text-center text-sm">
        <p>No transcript available for this video.</p>
        <p className="mt-1 text-xs">
          The uploader hasn&apos;t enabled captions. Chapters and your ebook still work.
        </p>
      </div>
    );
  }

  const visible = cues
    .slice(range.start, range.end)
    .map((cue, i) => ({ cue, index: range.start + i }));
  const paragraphs = searchResults ? [] : toParagraphs(visible);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript…"
            aria-label="Search the transcript"
            className="h-8 pl-8 text-xs"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {!query.trim() && activeIndex >= 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => {
              recenter(activeIndex);
              setFollowing(true);
            }}
          >
            <LocateFixed className="size-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant={following ? "secondary" : "ghost"}
          className="h-8 px-2 text-xs"
          onClick={() => setFollowing((v) => !v)}
        >
          Follow
        </Button>
      </div>

      {query.trim() && (
        <p className="text-muted-foreground border-b px-3 py-1.5 text-xs">
          {searchResults!.length === SEARCH_LIMIT
            ? `First ${SEARCH_LIMIT} matches`
            : `${searchResults!.length} ${searchResults!.length === 1 ? "match" : "matches"}`}
        </p>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {searchResults ? (
          searchResults.map(({ cue, index }) => (
            <CueRow key={index} cue={cue} active={false} onSeek={onSeek} />
          ))
        ) : (
          <div className="mx-auto max-w-prose space-y-5 text-[0.975rem] leading-[1.85]">
            {paragraphs.map((para) => (
              <p key={para[0].index}>
                {para.map(({ cue, index }) => {
                  const active = index === activeIndex;
                  return (
                    <span
                      key={index}
                      ref={active ? activeRef : undefined}
                      onClick={() => onSeek(cue.start)}
                      title={formatTime(cue.start)}
                      className={cn(
                        "cursor-pointer rounded-md transition-colors",
                        active
                          ? "bg-position/25 text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {cue.text}{" "}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CueRow = memo(function CueRow({
  cue,
  active,
  onSeek,
  ref,
}: {
  cue: TranscriptCue;
  active: boolean;
  onSeek: (s: number) => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      onClick={() => onSeek(cue.start)}
      className={cn(
        "flex w-full gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
        active ? "bg-position/15 text-foreground" : "hover:bg-accent/50 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "shrink-0 font-mono text-xs tabular-nums",
          active ? "text-position" : "text-muted-foreground",
        )}
      >
        {formatTime(cue.start)}
      </span>
      <span className={cn("text-[13px] leading-relaxed", active && "font-medium")}>{cue.text}</span>
    </button>
  );
});
