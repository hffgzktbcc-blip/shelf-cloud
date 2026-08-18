"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Candidate = {
  source: "openlibrary" | "google" | "apple" | "epub";
  title: string;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  description: string | null;
  publisher: string | null;
  score: number;
};

export function CoverPicker({
  bookId,
  bookTitle,
  onApplied,
}: {
  bookId: string;
  bookTitle: string;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [sources, setSources] = useState<{ openlibrary: string; google: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [useBlurb, setUseBlurb] = useState(true);

  useEffect(() => {
    if (!open) return;
    // Superseded requests are ignored rather than aborted: an abort rejects mid-`.json()`,
    // and a rejection that no longer owns the state can't safely clear the loading flag —
    // which stranded the spinner forever.
    let stale = false;

    // Typing shouldn't fire a lookup per keystroke; the first open shouldn't wait either.
    const timer = setTimeout(
      () => {
        setLoading(true);
        const params = new URLSearchParams({ bookId });
        if (query.trim()) params.set("q", query.trim());

        fetch(`/api/bookdata?${params}`)
          .then((r) => r.json())
          .then((d) => {
            if (stale) return;
            setCandidates(d.candidates ?? []);
            setSources(d.sources ?? null);
            setLoading(false);
          })
          .catch(() => {
            if (stale) return;
            setCandidates([]);
            setLoading(false);
          });
      },
      query.trim() ? 400 : 0,
    );

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, bookId, query]);

  async function apply(c: Candidate) {
    setApplying(c.coverUrl ?? c.title);
    try {
      const res = await fetch("/api/bookdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          coverUrl: c.coverUrl ?? undefined,
          author: c.authors[0] ?? undefined,
          description: useBlurb && c.description ? c.description : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not apply that");
      toast.success("Cover and details updated");
      setOpen(false);
      onApplied();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setCandidates(null);
          setSources(null);
          setQuery("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ImageIcon className="size-4" />
          Find cover
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find the real cover</DialogTitle>
          <DialogDescription>
            Checks the EPUB you loaded first, then Open Library, Apple Books and Google Books, so
            the shelf shows book art instead of a video thumbnail. The original stays on the audio
            part and can be restored.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Searching for “${bookTitle.slice(0, 40)}” — type to search differently`}
            className="h-9 pl-9"
          />
        </div>

        {candidates === null && loading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Looking up book data…
          </div>
        ) : candidates === null ? null : candidates.length === 0 && !loading ? (
          <div className="text-muted-foreground py-10 text-center text-sm">
            <p>No covers found.</p>
            <p className="mt-1 text-xs">
              Try searching by the real book title — audiobook uploads often use their own wording.
            </p>
            {sources?.google === "ratelimited" && (
              <p className="mt-4 text-xs leading-relaxed text-amber-500/90">
                Google Books is out of quota, so only Open Library and Apple Books were searched.
                A free <code className="bg-muted mx-1 rounded px-1">GOOGLE_BOOKS_API_KEY</code>
                in <code className="bg-muted rounded px-1">.env</code> adds it back — see the README.
              </p>
            )}
          </div>
        ) : (
          <>
            <div
              className={`grid max-h-[22rem] grid-cols-3 gap-3 overflow-y-auto transition-opacity sm:grid-cols-4 ${
                loading ? "opacity-40" : ""
              }`}
            >
              {candidates.map((c, i) => (
                <button
                  key={`${c.source}-${i}`}
                  onClick={() => apply(c)}
                  disabled={applying !== null}
                  className="group text-left disabled:opacity-50"
                >
                  <div className="bg-muted relative aspect-[2/3] overflow-hidden rounded-lg ring-1 ring-white/10 transition-transform group-hover:-translate-y-0.5 group-hover:ring-white/30">
                    {c.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coverUrl} alt="" className="size-full object-cover" />
                    )}
                    {applying === (c.coverUrl ?? c.title) && (
                      <div className="absolute inset-0 grid place-items-center bg-black/60">
                        <Loader2 className="size-5 animate-spin" />
                      </div>
                    )}
                    {c.source === "epub" ? (
                      <Badge className="absolute top-1.5 left-1.5 px-1.5 py-0 text-xs">
                        your EPUB
                      </Badge>
                    ) : (
                      c.score >= 0.9 && (
                        <Badge className="absolute top-1.5 left-1.5 px-1.5 py-0 text-xs">best</Badge>
                      )
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{c.title}</p>
                  <p className="text-muted-foreground line-clamp-1 text-xs">
                    {c.source === "epub"
                      ? "From the ebook you loaded"
                      : `${c.authors[0] ?? "Unknown"}${c.year ? ` · ${c.year}` : ""}`}
                  </p>
                </button>
              ))}
            </div>

            {sources?.google === "ratelimited" && (
              <p className="text-xs text-amber-500/80">
                Google Books is out of quota — these are from Open Library and Apple Books.
              </p>
            )}

            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={useBlurb}
                onChange={(e) => setUseBlurb(e.target.checked)}
                className="accent-primary size-3.5"
              />
              Also replace the description with the publisher&apos;s, when one is available
            </label>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
