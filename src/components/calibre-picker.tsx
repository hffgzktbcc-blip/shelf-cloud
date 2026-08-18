"use client";

import { useEffect, useState } from "react";
import { BookMarked, Check, Loader2, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";

type CalibreEntry = {
  id: number;
  title: string;
  author: string | null;
  sizeBytes: number;
  hasCover: boolean;
  suggested: boolean;
};

export function CalibrePicker({
  bookId,
  bookTitle,
  bookAuthor,
  onImported,
}: {
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<CalibreEntry[] | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [library, setLibrary] = useState("");
  const [importing, setImporting] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams({ q: query, title: bookTitle });
    if (bookAuthor) params.set("author", bookAuthor);
    fetch(`/api/calibre?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setAvailable(d.available);
        setLibrary(d.library ?? "");
        setBooks(d.books ?? []);
      })
      .catch(() => setAvailable(false));
  }, [open, query, bookTitle, bookAuthor]);

  async function importBook(calibreId: number) {
    setImporting(calibreId);
    try {
      const res = await fetch("/api/calibre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, calibreId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(`Added “${data.importedFrom}” from Calibre`);
      setOpen(false);
      onImported();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <BookMarked className="size-4" />
          From Calibre
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Your Calibre library</DialogTitle>
          <DialogDescription>
            Copies the EPUB into Shelf. Your Calibre library is only ever read, never changed.
          </DialogDescription>
        </DialogHeader>

        {available === false ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            <p>No Calibre library found.</p>
            <p className="mt-1 text-xs">
              Looked in <code className="bg-muted rounded px-1">{library}</code>
            </p>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or author…"
                className="h-9 pl-8"
              />
            </div>

            <div className="max-h-80 space-y-1 overflow-y-auto">
              {books === null ? (
                <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Reading your library…
                </div>
              ) : books.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Nothing matched. Only books with an EPUB can be used.
                </p>
              ) : (
                books.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => importBook(b.id)}
                    disabled={importing !== null}
                    className={cn(
                      "hover:bg-accent/50 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors disabled:opacity-50",
                      b.suggested && "bg-primary/10",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {b.author ?? "Unknown author"}
                        {b.sizeBytes > 0 && ` · ${(b.sizeBytes / 1e6).toFixed(1)} MB`}
                      </p>
                    </div>
                    {b.suggested && (
                      <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                        <Check className="size-3" />
                        likely match
                      </Badge>
                    )}
                    {importing === b.id && <Loader2 className="size-4 shrink-0 animate-spin" />}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
