"use client";

import Link from "next/link";
import { AlertTriangle, BookOpen, Check, FileText, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/cover";

export type EbookRow = {
  id: string;
  fileName: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  addedAt: string;
  bytes: number | null;
  missing: boolean;
  blocks: number;
  marks: number;
  aligned: number;
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EbooksClient({ rows }: { rows: EbookRow[] }) {
  const totalBytes = rows.reduce((s, r) => s + (r.bytes ?? 0), 0);
  const alignedCount = rows.filter((r) => r.aligned > 1).length;

  if (rows.length === 0) return <Empty />;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-9">
        <h1 className="text-4xl font-semibold tracking-tight">Ebooks</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {rows.length} {rows.length === 1 ? "file" : "files"}
          <span className="text-muted-foreground/40 mx-2">·</span>
          {formatBytes(totalBytes)}
          <span className="text-muted-foreground/40 mx-2">·</span>
          {alignedCount} aligned to audio
        </p>
      </header>

      <div className="space-y-2">
        {rows.map((r) => (
          <Row key={r.id} row={r} />
        ))}
      </div>

      <p className="text-subtle-foreground mt-8 text-xs leading-relaxed">
        Aligning an ebook is what lets the text follow the narration, places your Kindle and Kobo
        highlights on the timeline, and turns a Kobo reading position into a timestamp. Run it from
        the book&apos;s player, under the Ebook tab.
      </p>
    </div>
  );
}

function Row({ row }: { row: EbookRow }) {
  const isAligned = row.aligned > 1;

  return (
    <div className="bg-card/40 hover:bg-card/70 flex items-center gap-4 rounded-lg border p-3 transition-colors">
      <Cover
        src={row.missing ? null : `/api/ebooks/${row.id}/cover`}
        className="h-20 w-14 shrink-0 rounded-md ring-1 ring-white/10"
      />

      <div className="min-w-0 flex-1">
        <Link href={`/book/${row.bookId}`} className="hover:text-primary font-medium">
          {row.bookTitle}
        </Link>
        {row.bookAuthor && (
          <p className="text-muted-foreground truncate text-sm">{row.bookAuthor}</p>
        )}
        <p className="text-subtle-foreground mt-1 truncate font-mono text-xs">{row.fileName}</p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-muted-foreground text-xs tabular-nums">{formatBytes(row.bytes)}</p>
        {row.blocks > 0 && (
          <p className="text-subtle-foreground text-xs tabular-nums">
            {row.blocks.toLocaleString()} blocks
          </p>
        )}
      </div>

      <div className="shrink-0">
        {row.missing ? (
          <Badge variant="outline" className="gap-1 text-amber-500">
            <AlertTriangle className="size-3" />
            File missing
          </Badge>
        ) : isAligned ? (
          <Badge variant="secondary" className="gap-1">
            <Check className="size-3" />
            {row.aligned} marks
          </Badge>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/book/${row.bookId}`}>
              <Waypoints className="size-3.5" />
              Not aligned
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-4xl font-semibold tracking-tight">Ebooks</h1>
      <div className="border-border/60 mt-10 flex flex-col items-center rounded-2xl border border-dashed px-6 py-24 text-center">
        <FileText className="text-muted-foreground/40 size-12" />
        <h2 className="mt-5 text-lg font-medium">No ebooks loaded yet</h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
          Add an EPUB to any book and it shows up here — from your computer, from Calibre, or from
          a connected Kobo.
        </p>
        <Button asChild className="mt-7 h-10">
          <Link href="/">
            <BookOpen className="size-4" />
            Go to your library
          </Link>
        </Button>
      </div>
    </div>
  );
}
