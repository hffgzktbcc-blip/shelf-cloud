"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tablet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";

type Position = {
  document: string;
  device: string;
  percentage: number;
  updatedAt: number;
  bookId: string | null;
  bookTitle: string | null;
  timeSec: number | null;
  partId: string | null;
  blockIndex: number | null;
  coverage: "ok" | "before" | "after" | "unaligned" | "unknown";
};

function ago(unix: number): string {
  const mins = Math.floor((Date.now() / 1000 - unix) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function KoboPosition({ bookId }: { bookId: string }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [unmatched, setUnmatched] = useState<Position[]>([]);
  const [bindableEbookId, setBindableEbookId] = useState<string | null>(null);
  const [binding, setBinding] = useState<string | null>(null);
  const [jumping, setJumping] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let stale = false;
    fetch(`/api/kobo-position?bookId=${bookId}`)
      .then((r) => r.json())
      .then((d) => {
        if (stale) return;
        setPosition(d.positions?.[0] ?? null);
        setUnmatched(d.unmatched ?? []);
        setBindableEbookId(d.bindableEbookId ?? null);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [bookId]);

  /**
   * Jumping writes the saved position and then opens the player, which is exactly what
   * Resume already does — so the player itself needs no new seek path.
   */
  async function jump(partId: string, timeSec: number) {
    setJumping(true);
    try {
      const res = await fetch(`/api/parts/${partId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSec: Math.floor(timeSec) }),
      });
      if (!res.ok) throw new Error("Could not set the position");
      router.push(`/book/${bookId}/play/${partId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setJumping(false);
    }
  }

  /** Tell Shelf that an unrecognised Kobo document is this book's ebook. */
  async function bind(document: string) {
    if (!bindableEbookId) return;
    setBinding(document);
    try {
      const res = await fetch("/api/kobo-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, ebookId: bindableEbookId }),
      });
      if (!res.ok) throw new Error("Could not link that document");
      router.refresh();
      const d = await fetch(`/api/kobo-position?bookId=${bookId}`).then((r) => r.json());
      setPosition(d.positions?.[0] ?? null);
      setUnmatched(d.unmatched ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBinding(null);
    }
  }

  if (!position && unmatched.length === 0) return null;

  if (!position) {
    return (
      <div className="bg-card/50 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Tablet className="text-muted-foreground size-4" />
          <p className="text-sm font-medium">
            {unmatched.length === 1 ? "A Kobo sync arrived" : `${unmatched.length} Kobo syncs arrived`}
          </p>
        </div>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {unmatched.length === 1 ? "It doesn't" : "They don't"} match any book here — a Kobo
          renames sideloaded files, so the copy on the device can differ from the one you loaded.
          Link it if it&apos;s this book.
        </p>

        <div className="mt-3 space-y-2">
          {unmatched.map((u) => (
            <div key={u.document} className="flex items-center justify-between gap-3">
              <span className="text-subtle-foreground truncate font-mono text-xs">
                {u.device} · {Math.round(u.percentage * 100)}% · {u.document.slice(0, 10)}…
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!bindableEbookId || binding !== null}
                onClick={() => bind(u.document)}
              >
                {binding === u.document && <Loader2 className="size-4 animate-spin" />}
                This book
              </Button>
            </div>
          ))}
        </div>

        {!bindableEbookId && (
          <p className="text-subtle-foreground mt-3 text-xs">
            Load this book&apos;s EPUB first — linking needs something to match against.
          </p>
        )}
      </div>
    );
  }

  const pct = Math.round(position.percentage * 100);

  return (
    <div className="bg-card/50 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Tablet className="text-muted-foreground size-4" />
        <p className="text-sm font-medium">{position.device}</p>
        <span className="text-subtle-foreground text-xs">{ago(position.updatedAt)}</span>
      </div>

      <p className="text-muted-foreground mt-2 text-sm">
        You&apos;re <strong className="text-foreground">{pct}%</strong> through the ebook.
      </p>

      {position.coverage === "ok" && position.timeSec !== null && position.partId ? (
        <Button
          size="sm"
          className="mt-3"
          disabled={jumping}
          onClick={() => jump(position.partId!, position.timeSec!)}
        >
          {jumping && <Loader2 className="size-4 animate-spin" />}
          Jump to {formatTime(position.timeSec)}
        </Button>
      ) : (
        <p className="text-subtle-foreground mt-2 text-xs leading-relaxed">
          {position.coverage === "before" &&
            "That passage comes before the audio you have here — this recording starts later in the book."}
          {position.coverage === "after" &&
            "That passage comes after the audio you have here. Add the next part to follow along."}
          {position.coverage === "unaligned" &&
            "Run Auto-sync on this book first, so reading positions can be matched to the audio."}
        </p>
      )}
    </div>
  );
}
