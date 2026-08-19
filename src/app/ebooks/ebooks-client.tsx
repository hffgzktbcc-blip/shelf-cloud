"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Copy, FileText, Loader2, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/cover";
import { cn } from "@/lib/utils";
import { alignEbookToParts } from "@/lib/align-run";

export type EbookRow = {
  id: string;
  fileName: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  bytes: number | null;
  missing: boolean;
  blocks: number;
  marks: number;
  coverage: number;
  partsTotal: number;
  partsAligned: number;
  alignableParts: { id: string; videoId: string }[];
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What each state actually gives you, in plain terms rather than a badge colour. */
function consequence(r: EbookRow): string {
  if (r.missing) return "The file is gone from storage — nothing can read it.";
  if (r.marks < 2) {
    return r.alignableParts.length === 0
      ? "No narration with captions to match against, so the text can't follow along."
      : "Loaded, but the text can't follow the narration until it's aligned.";
  }
  if (r.coverage < 40) {
    return `Follows the narration across about ${r.coverage}% of the book — the rest has no audio to match.`;
  }
  return "The text follows the narration, highlights land on the timeline, and a Kobo position becomes a timestamp.";
}

export function EbooksClient({ rows }: { rows: EbookRow[] }) {
  const [busyAll, setBusyAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "aligned" | "unaligned">("all");
  const router = useRouter();

  if (rows.length === 0) return <Empty />;

  const bestByName = new Map<string, string>();
  for (const r of rows) {
    const best = rows.find((x) => x.id === bestByName.get(r.fileName));
    if (!best || r.marks > best.marks) bestByName.set(r.fileName, r.id);
  }
  const redundant = new Set(rows.filter((r) => bestByName.get(r.fileName) !== r.id).map((r) => r.id));

  const unaligned = rows.filter((r) => !r.missing && r.marks < 2 && r.alignableParts.length > 0);
  const following = rows.filter((r) => r.marks > 1).length;
  const totalBytes = rows.reduce((s, r) => s + (r.bytes ?? 0), 0);

  const shown = rows.filter((r) =>
    filter === "all" ? true : filter === "aligned" ? r.marks > 1 : r.marks < 2,
  );

  async function alignAll() {
    setBusyAll(true);
    let done = 0;
    for (const r of unaligned) {
      try {
        const out = await alignEbookToParts(r.id, r.alignableParts);
        if (out.some((o) => o.points > 0)) done++;
      } catch {
        // Keep going; one bad EPUB shouldn't stop the rest.
      }
    }
    setBusyAll(false);
    toast[done > 0 ? "success" : "error"](
      done > 0 ? `Aligned ${done} of ${unaligned.length}` : "Nothing could be aligned",
    );
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Ebooks</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {rows.length} files
            <span className="text-muted-foreground/40 mx-2">·</span>
            {formatBytes(totalBytes)}
            <span className="text-muted-foreground/40 mx-2">·</span>
            <span className={following > 0 ? "text-position" : undefined}>
              {following} following the narration
            </span>
          </p>
        </div>

        {unaligned.length > 0 && (
          <Button onClick={alignAll} disabled={busyAll}>
            {busyAll ? <Loader2 className="size-4 animate-spin" /> : <Waypoints className="size-4" />}
            Align all unaligned ({unaligned.length})
          </Button>
        )}
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All", rows.length],
            ["aligned", "Following", following],
            ["unaligned", "Not aligned", rows.length - following],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              filter === key
                ? "border-position/60 bg-position/10 text-foreground"
                : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span className="text-subtle-foreground ml-1.5 tabular-nums">{count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.map((r) => (
          <Row key={r.id} row={r} redundant={redundant.has(r.id)} />
        ))}
      </div>
    </div>
  );
}

function Row({ row, redundant }: { row: EbookRow; redundant: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const router = useRouter();

  const aligned = row.marks > 1;

  async function align() {
    setBusy("Starting…");
    try {
      const out = await alignEbookToParts(row.id, row.alignableParts, setBusy);
      const points = out.reduce((s, o) => s + o.points, 0);
      if (points === 0) throw new Error(out[0]?.error ?? "No confident matches");
      toast.success(`Aligned ${points} points across ${out.filter((o) => o.points > 0).length} part(s)`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/ebooks/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove that file");
      toast.success("Duplicate removed");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setRemoving(false);
    }
  }

  return (
    <div className="bg-card/50 rounded-xl border p-3">
      <div className="flex items-start gap-4">
        <Cover
          src={row.missing ? null : `/api/ebooks/${row.id}/cover`}
          className="h-20 w-14 shrink-0 rounded-md ring-1 ring-white/10"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/book/${row.bookId}`} className="hover:text-position font-medium">
              {row.bookTitle}
            </Link>
            {redundant && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Copy className="size-3" />
                Duplicate
              </Badge>
            )}
          </div>
          {row.bookAuthor && (
            <p className="text-muted-foreground truncate text-sm">{row.bookAuthor}</p>
          )}
          <p className="text-subtle-foreground mt-0.5 truncate font-mono text-xs">{row.fileName}</p>

          {/* Coverage is the point of the feature, so it gets the meter. */}
          <div className="mt-3 flex items-center gap-3">
            <div className="bg-secondary h-1.5 max-w-64 flex-1 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full", aligned ? "bg-position" : "bg-muted-foreground/40")}
                style={{ width: `${aligned ? Math.max(3, row.coverage) : 0}%` }}
              />
            </div>
            <span className="text-subtle-foreground shrink-0 text-xs tabular-nums">
              {aligned
                ? `${row.coverage}% · ${row.marks} marks · ${row.partsAligned}/${row.partsTotal} parts`
                : "not aligned"}
            </span>
          </div>

          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{consequence(row)}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-subtle-foreground text-xs tabular-nums">
            {formatBytes(row.bytes)}
          </span>

          {row.missing ? (
            <Badge variant="outline" className="gap-1 text-amber-500">
              <AlertTriangle className="size-3" />
              Missing
            </Badge>
          ) : row.alignableParts.length > 0 ? (
            <Button size="sm" variant={aligned ? "ghost" : "secondary"} onClick={align} disabled={busy !== null}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Waypoints className="size-3.5" />}
              {busy ?? (aligned ? "Re-align" : "Align")}
            </Button>
          ) : null}

          {redundant && (
            <Button size="sm" variant="ghost" onClick={remove} disabled={removing}>
              {removing && <Loader2 className="size-3.5 animate-spin" />}
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-4xl font-semibold tracking-tight">Ebooks</h1>
      <div className="border-border/60 mt-10 flex flex-col items-center rounded-xl border border-dashed px-6 py-24 text-center">
        <FileText className="text-muted-foreground/40 size-12" />
        <h2 className="mt-5 text-lg font-medium">No ebooks loaded yet</h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
          Add an EPUB to any book and it shows up here — from your computer, from Calibre, or from
          a connected Kobo.
        </p>
        <Button asChild className="mt-7">
          <Link href="/library">
            <BookOpen className="size-4" />
            Go to your library
          </Link>
        </Button>
      </div>
    </div>
  );
}
