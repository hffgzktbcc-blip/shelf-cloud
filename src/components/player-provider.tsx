"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { Cover } from "@/components/cover";
import { parseAudiobookTitle } from "@/lib/title";
import { DEFAULT_PREFS, parsePrefs, type Prefs } from "@/lib/prefs";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export type Track = {
  bookId: string;
  partId: string;
  videoId: string;
  bookTitle: string;
  partTitle: string;
  coverUrl: string | null;
  startAt: number;
};

type PlayerState = {
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  ended: boolean;
};

type Ctx = {
  track: Track | null;
  state: PlayerState;
  load: (t: Track) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekTo: (s: number) => void;
  nudge: (d: number) => void;
  setRate: (r: number) => void;
  rate: number;
  /** Epoch ms when playback should stop, or null. */
  sleepAt: number | null;
  setSleepTimer: (minutes: number | null) => void;
  stop: () => void;
  /** The player page hands over the element the video should sit in. */
  setAnchor: (el: HTMLElement | null) => void;
  /**
   * Audio-only mode. The host iframe is `fixed z-50`, so a page-level overlay can never
   * cover it — hiding the video has to happen here. It is faded out rather than
   * unmounted, because removing the iframe from the DOM stops playback.
   */
  videoHidden: boolean;
  setVideoHidden: (v: boolean) => void;
  /** Chapter line for the docked bar; the provider can't know it on its own. */
  nowPlayingLabel: string | null;
  setNowPlayingLabel: (s: string | null) => void;
  /** Playback preferences, loaded once and shared by the page and the docked bar. */
  prefs: Prefs;
};

const PlayerContext = createContext<Ctx | null>(null);

export function usePlayer(): Ctx {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}

/**
 * Owns the one and only YouTube iframe, mounted above the router so navigating between
 * pages never unmounts it — moving an iframe in the DOM reloads it and stops playback,
 * so instead the host stays put and is *positioned* over whatever slot the page offers.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<Track | null>(null);
  const creatingRef = useRef(false);
  const pendingRef = useRef<Track | null>(null);

  const [track, setTrack] = useState<Track | null>(null);
  const [docked, setDocked] = useState(true);
  const [videoHidden, setVideoHidden] = useState(false);
  const [nowPlayingLabel, setNowPlayingLabel] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [rate, setRateState] = useState(1);
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const fadeRef = useRef<number | null>(null);
  const [state, setState] = useState<PlayerState>({
    ready: false,
    playing: false,
    currentTime: 0,
    duration: 0,
    ended: false,
  });

  // Keep the fixed host glued to the page's anchor, or docked bottom-right.
  const reposition = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const anchor = anchorRef.current;
    if (anchor && anchor.isConnected) {
      const r = anchor.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        host.style.top = `${r.top}px`;
        host.style.left = `${r.left}px`;
        host.style.width = `${r.width}px`;
        host.style.height = `${r.height}px`;
        host.style.borderRadius = "12px";
        setDocked(false);
        return;
      }
    }
    host.style.top = "";
    host.style.left = "";
    host.style.width = "";
    host.style.height = "";
    host.style.borderRadius = "";
    setDocked(true);
  }, []);

  useLayoutEffect(() => {
    reposition();
    const onChange = () => reposition();
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    const ro = new ResizeObserver(onChange);
    if (anchorRef.current) ro.observe(anchorRef.current);
    const id = window.setInterval(onChange, 500);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [reposition, track]);

  const setAnchor = useCallback(
    (el: HTMLElement | null) => {
      anchorRef.current = el;
      reposition();
    },
    [reposition],
  );

  // Preferences are read once; they change rarely and only from the settings screen.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const loaded = parsePrefs(d.settings?.playbackPrefs);
        setPrefs(loaded);
        // Apply the starting speed once, when preferences arrive. Re-applying it on every
        // track change would undo a speed you set mid-book, which the setting explicitly
        // promises not to do.
        setRateState(loaded.defaultSpeed);
      })
      .catch(() => {});
  }, []);

  // Poll position; the API has no continuous time event.
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        const t = p.getCurrentTime();
        const d = p.getDuration?.() ?? 0;
        setState((s) =>
          Math.abs(s.currentTime - t) > 0.2 || s.duration !== d
            ? { ...s, currentTime: t, duration: d }
            : s,
        );
      }
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Read at fire time so the save timer never needs re-creating. Written in an effect,
  // not during render — a ref mutated while rendering breaks under concurrent rendering.
  const liveRef = useRef({ currentTime: 0, duration: 0, rate: 1 });
  useEffect(() => {
    liveRef.current = { currentTime: state.currentTime, duration: state.duration, rate };
  });

  // Persist position even while the listener is off browsing another page.
  //
  // Deliberately depends only on `playing`: including currentTime restarted the timer
  // before it could elapse, and the values are read from refs at fire time instead.
  useEffect(() => {
    if (!state.playing) return;
    const id = window.setInterval(() => {
      const t = trackRef.current;
      if (!t) return;
      fetch(`/api/parts/${t.partId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSec: liveRef.current.currentTime,
          rate: liveRef.current.rate,
          ...(liveRef.current.duration
            ? { duration: Math.round(liveRef.current.duration) }
            : {}),
        }),
      }).catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [state.playing]);

  const load = useCallback((t: Track) => {
    trackRef.current = t;
    setTrack(t);

    loadIframeApi().then(() => {
      if (!mountRef.current) return;
      const existing = playerRef.current;

      if (existing?.loadVideoById) {
        if (existing.getVideoData?.()?.video_id === t.videoId) return; // already playing it
        existing.loadVideoById({ videoId: t.videoId, startSeconds: Math.floor(t.startAt) });
        return;
      }

      // The API attaches its methods asynchronously, so "does it have loadVideoById yet"
      // is not a safe has-a-player check — under StrictMode's double-invoked effects it
      // reads false the second time and builds a second player on the detached mount
      // node, clobbering the working one. Gate on an explicit flag instead.
      if (creatingRef.current) {
        pendingRef.current = t;
        return;
      }
      creatingRef.current = true;

      new window.YT.Player(mountRef.current, {
        videoId: t.videoId,
        playerVars: {
          start: Math.floor(t.startAt),
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: any) => {
            // e.target is the fully-initialised player; the constructor's return value
            // may still be missing its methods, so this is what we keep.
            playerRef.current = e.target;
            creatingRef.current = false;

            const queued = pendingRef.current;
            pendingRef.current = null;
            if (queued && queued.videoId !== t.videoId) {
              e.target.loadVideoById?.({
                videoId: queued.videoId,
                startSeconds: Math.floor(queued.startAt),
              });
            }

            setState((s) => ({
              ...s,
              ready: true,
              duration: e.target.getDuration?.() ?? 0,
            }));
          },
          onStateChange: (e: any) => {
            const YT = window.YT.PlayerState;
            setState((s) => ({
              ...s,
              playing: e.data === YT.PLAYING,
              ended: e.data === YT.ENDED,
              duration: e.target.getDuration?.() ?? s.duration,
            }));
          },
        },
      });
    });
  }, []);

  const play = useCallback(() => playerRef.current?.playVideo?.(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo?.(), []);
  const toggle = useCallback(() => {
    if (state.playing) pause();
    else play();
  }, [state.playing, play, pause]);
  const seekTo = useCallback((s: number) => {
    playerRef.current?.seekTo?.(s, true);
    setState((st) => ({ ...st, currentTime: s }));
  }, []);
  const nudge = useCallback(
    (d: number) => {
      const p = playerRef.current;
      if (p?.getCurrentTime) seekTo(Math.max(0, p.getCurrentTime() + d));
    },
    [seekTo],
  );
  const setRate = useCallback((r: number) => {
    setRateState(r);
    playerRef.current?.setPlaybackRate?.(r);
  }, []);

  const setSleepTimer = useCallback((minutes: number | null) => {
    setSleepAt(minutes === null ? null : Date.now() + minutes * 60_000);
  }, []);
  const stop = useCallback(() => {
    playerRef.current?.pauseVideo?.();
    trackRef.current = null;
    setTrack(null);
  }, []);

  // A freshly loaded video resets to 1x, so re-apply the chosen rate.
  useEffect(() => {
    if (state.ready) playerRef.current?.setPlaybackRate?.(rate);
  }, [state.ready, rate, track?.videoId]);

  useEffect(() => {
    if (sleepAt === null) return;
    const id = window.setInterval(() => {
        if (Date.now() >= sleepAt) {
          if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
          if (prefs.fadeOnSleep && playerRef.current?.getVolume && playerRef.current?.setVolume) {
            const startVolume = playerRef.current.getVolume();
            let volume = startVolume;
            fadeRef.current = window.setInterval(() => {
              volume = Math.max(0, volume - Math.max(1, startVolume / 5));
              playerRef.current?.setVolume?.(volume);
              if (volume === 0) {
                if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
                fadeRef.current = null;
                playerRef.current?.pauseVideo?.();
              }
            }, 1000);
          } else {
            playerRef.current?.pauseVideo?.();
          }
        setSleepAt(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [prefs.fadeOnSleep, sleepAt]);

  const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;


  return (
    <PlayerContext.Provider
      value={{
        track,
        state,
        load,
        play,
        pause,
        toggle,
        seekTo,
        nudge,
        setRate,
        rate,
        sleepAt,
        setSleepTimer,
        stop,
        setAnchor,
        videoHidden,
        setVideoHidden,
        nowPlayingLabel,
        setNowPlayingLabel,
        prefs,
      }}
    >
      {children}

      {/* One host, never remounted — moving an iframe in the DOM reloads it. When a page
          offers a slot it is positioned over it; otherwise it sits inside the mini bar. */}
      <div
        ref={hostRef}
        className={cn(
          "fixed z-50 overflow-hidden bg-black transition-opacity duration-300",
          track ? "opacity-100" : "pointer-events-none opacity-0",
          // Audio-only: keep it playing, just stop showing it.
          videoHidden && !docked ? "pointer-events-none opacity-0" : "",
          // Docked: the iframe keeps playing but stops being a second, competing player.
          // It is parked off-screen rather than unmounted, since moving or removing it
          // in the DOM reloads it and stops playback.
          docked ? "pointer-events-none -left-[9999px] h-[72px] w-32 opacity-0" : "",
        )}
      >
        <div ref={mountRef} className="size-full" />
      </div>

      {track && docked && (
        <div className="animate-in slide-in-from-bottom-4 fade-in fixed inset-x-0 bottom-14 z-40 border-t bg-card/95 md:bottom-0 shadow-2xl backdrop-blur duration-300">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
            {/* The jacket, which is what the video block was standing in for. */}
            <Link
              href={`/book/${track.bookId}/play/${track.partId}`}
              className="shrink-0"
              aria-label={`Back to ${track.bookTitle}`}
            >
              <Cover src={track.coverUrl} className="h-12 w-9 rounded-md ring-1 ring-white/10" />
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/book/${track.bookId}/play/${track.partId}`}
                className="hover:text-foreground text-foreground block truncate text-sm leading-tight font-medium transition-colors"
              >
                {track.bookTitle}
              </Link>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {nowPlayingLabel ?? parseAudiobookTitle(track.partTitle).partLabel ?? track.partTitle}
              </p>
              <div className="bg-secondary mt-1.5 h-1 w-full overflow-hidden rounded-full">
                <div
                  className="bg-position h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <p className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block">
              <span className="text-position">{formatTime(state.currentTime)}</span>
              {state.duration > 0 && (
                <span className="text-subtle-foreground"> / {formatTime(state.duration)}</span>
              )}
            </p>

            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => nudge(-prefs.skipBack)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-9 place-items-center rounded-md transition-colors"
                aria-label={`Back ${prefs.skipBack} seconds`}
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                onClick={toggle}
                className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95"
                aria-label={state.playing ? "Pause" : "Play"}
              >
                {state.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button
                onClick={() => nudge(prefs.skipForward)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-9 place-items-center rounded-md transition-colors"
                aria-label={`Forward ${prefs.skipForward} seconds`}
              >
                <RotateCw className="size-4" />
              </button>
              <button
                onClick={stop}
                className="text-muted-foreground hover:text-foreground hover:bg-accent ml-1 grid size-9 place-items-center rounded-md transition-colors"
                aria-label="Close player"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The bar is fixed, so page content needs somewhere to end. */}
      {track && docked && <div className="h-[76px]" aria-hidden />}

    </PlayerContext.Provider>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
