"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Candidate = { id: string; title: string; author: string | null; partTitles: string[] };
type Summary = {
  moving: {
    parts: number;
    bookmarks: number;
    ebooks: number;
    duplicateEbooksFolded: number;
    syncMarksRehomed: number;
  };
};

/**
 * A novel split across several uploads arrives as several books. This folds them back into
 * one, so a single ebook and one set of bookmarks cover the whole thing.
 */
export function MergeBooks({ bookId, bookTitle }: { bookId: string; bookTitle: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let stale = false;
    fetch(`/api/books?similarTo=${bookId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!stale) setCandidates(d.similar ?? []);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [bookId]);

  async function run(dryRun: boolean) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/books/${bookId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromBookId: selected, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not merge");

      if (dryRun) setSummary(data);
      else {
        toast.success("Books combined");
        setSummary(null);
        setSelected(null);
        setCandidates((c) => c.filter((x) => x.id !== selected));
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <GitMerge className="size-4 text-amber-500" />
        <p className="text-sm font-medium">
          {candidates.length === 1 ? "Another book" : `${candidates.length} other books`} looks like
          this one
        </p>
      </div>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        If these are parts of the same audiobook, combine them — one book with several parts needs
        only one ebook, and your bookmarks all live together.
      </p>

      <div className="mt-3 space-y-1">
        {candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSelected(c.id === selected ? null : c.id);
              setSummary(null);
            }}
            className={cn(
              "hover:bg-accent/40 w-full rounded-md px-2 py-2 text-left transition-colors",
              selected === c.id && "bg-primary/10",
            )}
          >
            <p className="text-sm font-medium">{c.title}</p>
            {c.partTitles.map((t, i) => (
              <p key={i} className="text-subtle-foreground truncate text-xs">
                {t}
              </p>
            ))}
          </button>
        ))}
      </div>

      {summary && (
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          Moves {summary.moving.parts} part{summary.moving.parts === 1 ? "" : "s"} and{" "}
          {summary.moving.bookmarks} bookmark{summary.moving.bookmarks === 1 ? "" : "s"} into “
          {bookTitle}”
          {summary.moving.duplicateEbooksFolded > 0 &&
            `, folding ${summary.moving.duplicateEbooksFolded} repeated ebook into the copy you keep and carrying ${summary.moving.syncMarksRehomed} sync marks across`}
          . Nothing is deleted except the now-empty book.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" disabled={!selected || busy} onClick={() => run(true)}>
          {busy && !summary && <Loader2 className="size-4 animate-spin" />}
          Check
        </Button>
        <Button size="sm" disabled={!selected || !summary || busy} onClick={() => run(false)}>
          {busy && summary && <Loader2 className="size-4 animate-spin" />}
          Combine
        </Button>
      </div>
    </div>
  );
}
