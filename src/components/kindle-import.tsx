"use client";

import { useState } from "react";
import { Highlighter, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatTime } from "@/lib/format";

type Preview = {
  total: number;
  matched: number;
  canPlace: boolean;
  sample: { preview: string; located: boolean; timeSec: number | null }[];
};

export function KindleImport({
  bookId,
  onImported,
}: {
  bookId: string;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/kindle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, raw, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read that export");

      if (dryRun) {
        setPreview(data);
      } else {
        toast.success(`Imported ${data.imported} highlight${data.imported === 1 ? "" : "s"}`);
        setOpen(false);
        setRaw("");
        setPreview(null);
        onImported();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPreview(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Highlighter className="size-4" />
          Kindle highlights
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import your Kindle highlights</DialogTitle>
          <DialogDescription>
            Open{" "}
            <a
              href="https://read.amazon.com/notebook"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              read.amazon.com/notebook
            </a>
            , pick the book, then copy its highlights and paste them here. A{" "}
            <code className="bg-muted rounded-md px-1">My Clippings.txt</code> from a Kindle device
            works too.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setPreview(null);
          }}
          placeholder="Paste your highlights here…"
          className="bg-background focus:ring-ring h-44 w-full resize-none rounded-md border p-3 text-sm focus:ring-1 focus:outline-none"
        />

        {preview && (
          <div className="bg-card/50 space-y-2 rounded-md border p-3 text-sm">
            <p>
              Found <strong>{preview.total}</strong> highlight{preview.total === 1 ? "" : "s"}
              {preview.canPlace ? (
                <>
                  {" · "}
                  <strong>{preview.matched}</strong> located in the book text
                </>
              ) : null}
            </p>

            {!preview.canPlace && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                This book has no ebook and alignment yet, so highlights can&apos;t be placed on the
                audio timeline. Add the EPUB and run Auto-sync first, or import anyway to keep them
                as notes at the start.
              </p>
            )}

            {preview.canPlace && preview.matched < preview.total && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {preview.total - preview.matched} couldn&apos;t be found in the text — usually a
                different edition, or a highlight spanning a page break. Those are skipped.
              </p>
            )}

            <ul className="space-y-1">
              {preview.sample.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span
                    className={
                      s.located ? "text-position font-mono tabular-nums" : "text-subtle-foreground"
                    }
                  >
                    {s.located && s.timeSec !== null ? formatTime(s.timeSec) : "—"}
                  </span>
                  <span className="text-muted-foreground line-clamp-1">{s.preview}…</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => run(true)}
            disabled={busy || raw.trim().length < 20}
          >
            {busy && !preview ? <Loader2 className="size-4 animate-spin" /> : null}
            Check
          </Button>
          <Button
            onClick={() => run(false)}
            disabled={busy || !preview || preview.matched === 0}
          >
            {busy && preview ? <Loader2 className="size-4 animate-spin" /> : null}
            Import {preview?.matched ? `${preview.matched} highlights` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
