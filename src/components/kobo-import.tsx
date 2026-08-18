"use client";

import { useEffect, useState } from "react";
import { Highlighter, Loader2, Tablet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";

type KoboBook = { contentId: string; title: string; author: string | null; highlightCount: number };
type Preview = {
  total: number;
  matched: number;
  canPlace: boolean;
  sample: { preview: string; located: boolean; timeSec: number | null }[];
};

export function KoboImport({ bookId, onImported }: { bookId: string; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [books, setBooks] = useState<KoboBook[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConnected(null);
    fetch("/api/kobo")
      .then((r) => r.json())
      .then((d) => {
        setConnected(!!d.connected);
        setBooks(d.books ?? []);
      })
      .catch(() => setConnected(false));
  }, [open]);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/kobo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, contentId: selected ?? undefined, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read the Kobo");

      if (dryRun) setPreview(data);
      else {
        toast.success(`Imported ${data.imported} highlight${data.imported === 1 ? "" : "s"}`);
        setOpen(false);
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
        if (!v) {
          setPreview(null);
          setSelected(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Tablet className="size-4" />
          From Kobo
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import highlights from your Kobo</DialogTitle>
          <DialogDescription>
            Plug the Kobo in and unlock it. Highlights are read straight off the device — nothing
            is written to it.
          </DialogDescription>
        </DialogHeader>

        {connected === null ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Looking for a Kobo…
          </div>
        ) : !connected ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            <Tablet className="mx-auto size-8 opacity-40" />
            <p className="mt-3">No Kobo found.</p>
            <p className="mt-1 text-xs">
              Connect it by USB and tap <strong>Connect</strong> on the device, then reopen this.
            </p>
          </div>
        ) : books.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Connected, but no highlights on the device yet.
          </p>
        ) : (
          <>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {books.map((b) => (
                <button
                  key={b.contentId}
                  onClick={() => {
                    setSelected(b.contentId);
                    setPreview(null);
                  }}
                  className={cn(
                    "hover:bg-accent/50 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                    selected === b.contentId && "bg-primary/10",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.title}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {b.author ?? "Unknown author"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                    <Highlighter className="size-3" />
                    {b.highlightCount}
                  </Badge>
                </button>
              ))}
            </div>

            {preview && (
              <div className="bg-card/50 space-y-2 rounded-md border p-3 text-sm">
                <p>
                  <strong>{preview.total}</strong> highlight{preview.total === 1 ? "" : "s"}
                  {preview.canPlace && (
                    <>
                      {" · "}
                      <strong>{preview.matched}</strong> located in the book text
                    </>
                  )}
                </p>
                {!preview.canPlace && (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    This book has no ebook and alignment yet, so highlights can&apos;t be placed on
                    the timeline. Add the EPUB and run Auto-sync first.
                  </p>
                )}
                <ul className="space-y-1">
                  {preview.sample.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span
                        className={
                          s.located
                            ? "text-primary font-mono tabular-nums"
                            : "text-subtle-foreground"
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
              <Button variant="secondary" onClick={() => run(true)} disabled={busy || !selected}>
                {busy && !preview ? <Loader2 className="size-4 animate-spin" /> : null}
                Check
              </Button>
              <Button
                onClick={() => run(false)}
                disabled={busy || !preview || preview.matched === 0}
              >
                {busy && preview ? <Loader2 className="size-4 animate-spin" /> : null}
                Import {preview?.matched ? `${preview.matched}` : ""}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
