"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Play, RefreshCw, Tablet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";

type Position = {
  document: string;
  label: string | null;
  device: string;
  percentage: number;
  updatedAt: number;
  bookId: string | null;
  bookTitle: string | null;
  timeSec: number | null;
  partId: string | null;
  coverage: "ok" | "before" | "after" | "unaligned" | "unknown";
};

type Linkable = { ebookId: string; bookId: string; bookTitle: string; fileName: string };

function ago(unix: number): string {
  const mins = Math.floor(Date.now() / 1000 - unix) / 60;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** What this position can and can't do, said plainly. */
function meaning(p: Position): string {
  if (p.coverage === "ok") return "";
  if (p.coverage === "unknown")
    return "Shelf doesn't have this book, so there's nothing to line it up against.";
  if (p.coverage === "unaligned")
    return "This book's ebook isn't aligned to the narration yet, so the position can't become a timestamp.";
  if (p.coverage === "before")
    return "This passage comes before the audio you have — the recording starts later in the book.";
  return "This passage comes after the audio you have. Add the next part to follow along.";
}

export function KoboClient({ configured }: { configured: boolean }) {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [linkable, setLinkable] = useState<Linkable[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  async function load() {
    const d = await fetch("/api/kobo-position").then((r) => r.json());
    setPositions(d.positions ?? []);
    setLinkable(d.linkable ?? []);
  }

  useEffect(() => {
    let stale = false;
    fetch("/api/kobo-position")
      .then((r) => r.json())
      .then((d) => {
        if (stale) return;
        setPositions(d.positions ?? []);
        setLinkable(d.linkable ?? []);
      })
      .catch(() => !stale && setPositions([]));
    return () => {
      stale = true;
    };
  }, []);

  async function link(document: string, ebookId: string) {
    setBusy(document);
    try {
      const res = await fetch("/api/kobo-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, ebookId }),
      });
      if (!res.ok) throw new Error("Could not link that");
      toast.success("Linked — it'll resolve from now on");
      await load();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function jump(p: Position) {
    if (!p.partId || p.timeSec === null) return;
    setBusy(p.document);
    try {
      await fetch(`/api/parts/${p.partId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSec: Math.floor(p.timeSec) }),
      });
      router.push(`/book/${p.bookId}/play/${p.partId}`);
    } finally {
      setBusy(null);
    }
  }

  const matched = (positions ?? []).filter((p) => p.bookId);
  const others = (positions ?? []).filter((p) => !p.bookId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">From your Kobo</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {positions === null
              ? "Reading…"
              : positions.length === 0
                ? "Nothing has arrived yet"
                : `${positions.length} book${positions.length === 1 ? "" : "s"} · ${matched.length} matched`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </header>

      {!configured && (
        <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">Sync isn&apos;t set up yet</p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            Create a token in Settings and copy it into the Kobo client, then tap Shelf sync on
            the device.
          </p>
          <Button asChild size="sm" variant="secondary" className="mt-3">
            <Link href="/settings">Open Settings</Link>
          </Button>
        </div>
      )}

      {positions !== null && positions.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
          <Tablet className="text-muted-foreground/40 size-10" />
          <h2 className="mt-4 text-lg font-medium">Nothing from the Kobo yet</h2>
          <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">
            Tap <strong>Shelf sync</strong> in the Kobo&apos;s menu while it&apos;s on the same
            Wi-Fi. Whatever you&apos;ve been reading shows up here with how far through you are.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...matched, ...others].map((p) => (
            <Row
              key={p.document}
              p={p}
              linkable={linkable}
              busy={busy === p.document}
              onLink={link}
              onJump={jump}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  p,
  linkable,
  busy,
  onLink,
  onJump,
}: {
  p: Position;
  linkable: Linkable[];
  busy: boolean;
  onLink: (doc: string, ebookId: string) => void;
  onJump: (p: Position) => void;
}) {
  const pct = Math.round(p.percentage * 100);
  const note = meaning(p);

  return (
    <div className="bg-card/50 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {p.bookTitle ?? p.label ?? p.document.slice(0, 16) + "…"}
        </p>
        {!p.bookId && (
          <Badge variant="outline" className="text-xs">
            not in Shelf
          </Badge>
        )}
        <span className="text-subtle-foreground text-xs">
          {p.device} · {ago(p.updatedAt)}
        </span>
      </div>

      {/* How far through, which is the thing you actually want to see. */}
      <div className="mt-3 flex items-center gap-3">
        <div className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
          <div className="bg-position h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className={cn("shrink-0 text-sm tabular-nums", pct > 0 ? "text-position" : "text-subtle-foreground")}>
          {pct}%
        </span>
      </div>

      {note && <p className="text-muted-foreground mt-2.5 text-xs leading-relaxed">{note}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {p.coverage === "ok" && p.timeSec !== null ? (
          <Button size="sm" disabled={busy} onClick={() => onJump(p)}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Listen from {formatTime(p.timeSec)}
          </Button>
        ) : null}

        {p.bookId && (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/book/${p.bookId}`}>Open the book</Link>
          </Button>
        )}

        {!p.bookId && linkable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                Link to a book
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {linkable.map((l) => (
                <DropdownMenuItem key={l.ebookId} onClick={() => onLink(p.document, l.ebookId)}>
                  {l.bookTitle}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
