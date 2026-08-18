"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Bookmark, Headphones, ListTree, Loader2, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

async function markSeen() {
  await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "welcomeSeen", value: "1" }),
  }).catch(() => {});
}

export function WelcomeClient({ hasBooks }: { hasBooks: boolean }) {
  const router = useRouter();
  const [going, setGoing] = useState<"discover" | "library" | null>(null);

  async function go(where: "discover" | "library") {
    setGoing(where);
    await markSeen();
    router.push(where === "discover" ? "/discover" : "/");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <div className="text-center">
        <p className="text-primary/80 flex items-center justify-center gap-2 text-xs font-medium tracking-[0.2em] uppercase">
          <Headphones className="size-4" />
          Welcome to Shelf
        </p>

        <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl">
          Listen with intention.
        </h1>

        <p className="text-muted-foreground mx-auto mt-5 max-w-xl leading-relaxed text-balance">
          Any YouTube audiobook, played in a proper reader: real chapters — read out of the
          narration when the upload has none — a transcript that follows along, your own ebook
          beside it, and bookmarks that never expire.
        </p>
      </div>

      <AppPreview />

      <div className="mx-auto mt-10 flex max-w-sm flex-col gap-3">
        <Button size="lg" className="h-11" onClick={() => go("discover")} disabled={going !== null}>
          {going === "discover" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Find your first audiobook
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-11"
          onClick={() => go("library")}
          disabled={going !== null}
        >
          {going === "library" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          {hasBooks ? "Go to my library" : "Skip for now — explore first"}
        </Button>
      </div>

      <p className="text-muted-foreground mx-auto mt-6 max-w-md text-center text-xs leading-relaxed">
        No account, no sign-in. Your library, bookmarks and position live in a file on this
        machine — nothing is uploaded anywhere.
      </p>
    </div>
  );
}

/** A still of the real layout, so the first screen shows what the app actually is. */
function AppPreview() {
  const chapters = [
    { time: "00:00", name: "An Unexpected Party" },
    { time: "41:12", name: "Roast Mutton" },
    { time: "1:22:05", name: "A Short Rest", active: true },
    { time: "2:04:38", name: "Over Hill and Under Hill" },
  ];

  return (
    <div className="border-border/60 bg-card/40 mt-12 overflow-hidden rounded-xl border shadow-2xl">
      <div className="grid gap-px sm:grid-cols-[0.85fr_1.1fr_0.85fr]">
        {/* Search column */}
        <div className="bg-background/40 p-3">
          <div className="border-border/60 text-muted-foreground flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
            <Search className="size-3" />
            the hobbit full
          </div>
          <div className="mt-2.5 space-y-1.5">
            {["The Hobbit — full audiobook · 10:14:13", "The Hobbit (unabridged) · 11:02:48", "Fellowship of the Ring · 19:07:12"].map(
              (label, i) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 rounded-md p-1.5 ${i === 0 ? "bg-primary/15" : ""}`}
                >
                  <div className="bg-muted h-6 w-10 shrink-0 rounded-sm" />
                  <span className="text-muted-foreground truncate text-xs">{label}</span>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Player column */}
        <div className="bg-background/70 flex flex-col items-center justify-center px-4 py-8">
          <div className="bg-muted/60 ring-border/60 size-20 rounded-lg ring-1" />
          <p className="mt-3 text-sm font-medium">The Hobbit</p>
          <p className="text-muted-foreground text-xs">J.R.R. Tolkien · Chapter 3</p>
          <div className="bg-secondary mt-4 h-1 w-full max-w-[190px] overflow-hidden rounded-full">
            <div className="bg-primary h-full w-[31%] rounded-full" />
          </div>
          <div className="text-muted-foreground mt-1.5 flex w-full max-w-[190px] justify-between text-[9px] tabular-nums">
            <span>00:31:30</span>
            <span>10:14:13</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-subtle-foreground text-xs">15</span>
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full">
              <Play className="size-3.5" />
            </span>
            <span className="text-subtle-foreground text-xs">30</span>
          </div>
        </div>

        {/* Chapters column */}
        <div className="bg-background/40 p-3">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <ListTree className="size-3" />
            Chapters
          </div>
          <div className="mt-2 space-y-0.5">
            {chapters.map((c) => (
              <div
                key={c.time}
                className={`flex items-center gap-2 rounded px-1.5 py-1 ${c.active ? "bg-primary/15" : ""}`}
              >
                <span
                  className={`font-mono text-[9px] tabular-nums ${c.active ? "text-primary" : "text-subtle-foreground"}`}
                >
                  {c.time}
                </span>
                <span
                  className={`truncate text-xs ${c.active ? "font-medium" : "text-muted-foreground"}`}
                >
                  {c.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-border/60 text-muted-foreground grid grid-cols-2 gap-3 border-t px-4 py-3 text-xs sm:grid-cols-4">
        {[
          { icon: Search, label: "Search in-app" },
          { icon: ListTree, label: "Real chapters" },
          { icon: BookOpen, label: "Your ebook" },
          { icon: Bookmark, label: "Bookmarks" },
        ].map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <Icon className="size-3" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
