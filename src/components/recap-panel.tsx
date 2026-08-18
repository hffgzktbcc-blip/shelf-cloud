"use client";

import { useEffect, useState } from "react";
import { Cpu, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/format";
import { PRESETS } from "@/lib/recap";

type Entry = { id: string; question: string; answer: string; timeSec: number; source: string };

export function RecapPanel({
  partId,
  currentTime,
  onSeek,
}: {
  partId: string;
  currentTime: number;
  onSeek: (s: number) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [ollama, setOllama] = useState<{ available: boolean; models: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/recap")
      .then((r) => r.json())
      .then((d) => setOllama({ available: !!d.ollama, models: d.models ?? [] }))
      .catch(() => setOllama({ available: false, models: [] }));
  }, []);

  async function ask(text: string) {
    if (busy || !text.trim()) return;
    setBusy(true);
    const askedAt = currentTime; // freeze — audio keeps moving while the model thinks
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId,
          timeSec: askedAt,
          question: text.trim(),
          model: ollama?.models[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build a recap");
      setEntries((e) => [
        { id: crypto.randomUUID(), question: text.trim(), answer: data.answer, timeSec: askedAt, source: data.source },
        ...e,
      ]);
      setQuestion("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="secondary"
              className="h-8 px-2.5 text-xs"
              disabled={busy}
              onClick={() => ask(p.question)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex gap-1.5"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about what you've heard…"
            className="h-9 text-sm"
            disabled={busy}
          />
          <Button type="submit" size="sm" className="h-9 px-3" disabled={busy || !question.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>

        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {ollama === null ? (
            <span>Checking for a local model…</span>
          ) : ollama.available ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Cpu className="size-3" />
              {ollama.models[0]}
            </Badge>
          ) : (
            <span>
              No local model — using sentence extraction. Install Ollama for real summaries.
            </span>
          )}
          <span className="ml-auto">Only up to {formatTime(currentTime)}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {busy && (
          <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Reading back over what you&apos;ve heard…
          </div>
        )}

        {entries.length === 0 && !busy ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
            <Sparkles className="size-8 opacity-40" />
            <p>Lost the thread?</p>
            <p className="text-xs">
              Ask what just happened — answers never use narration from ahead of you.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="group bg-card/50 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSeek(e.timeSec)}
                    className="text-primary font-mono text-xs tabular-nums hover:underline"
                  >
                    {formatTime(e.timeSec)}
                  </button>
                  <p className="flex-1 text-sm font-medium">{e.question}</p>
                  <button
                    onClick={() => setEntries((list) => list.filter((x) => x.id !== e.id))}
                    className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {e.answer}
                </p>
                {e.source === "extractive" && (
                  <p className="text-muted-foreground/60 mt-2 text-xs">
                    Key sentences from the narration — no model installed.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
