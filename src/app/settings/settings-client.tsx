"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  hasApiKey: boolean;
  stats: { books: number; parts: number; bookmarks: number; ebooks: number };
};

export function SettingsClient({ hasApiKey, stats }: Props) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function saveKey(settingKey: "youtubeApiKey", value: string) {
    setSaving(settingKey);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value }),
      });
      if (!res.ok) throw new Error("Could not save");
      toast.success(value ? "Key saved" : "Key cleared");
      setKey("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const save = (value: string) => saveKey("youtubeApiKey", value);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Everything is stored locally on this machine.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            YouTube Data API key
            {hasApiKey && (
              <Badge variant="secondary" className="gap-1">
                <Check className="size-3" />
                Set
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Optional. Search works without a key, but a key makes results more reliable and adds
            accurate durations. Yours stays in the local database and is never sent anywhere except
            Google.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="apiKey" className="text-xs">
              API key
            </Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={hasApiKey ? "••••••••••••••••" : "AIza…"}
                autoComplete="off"
              />
              <Button onClick={() => save(key.trim())} disabled={saving !== null || !key.trim()}>
                {saving === "youtubeApiKey" ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <a
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              Get a key from Google Cloud Console
              <ExternalLink className="size-3" />
            </a>
            {hasApiKey && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs"
                onClick={() => save("")}
              >
                Clear key
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Your library</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-4 gap-4 text-center">
            {[
              ["Books", stats.books],
              ["Parts", stats.parts],
              ["Bookmarks", stats.bookmarks],
              ["Ebooks", stats.ebooks],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Keyboard shortcuts</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            {[
              ["Space", "Play / pause"],
              ["←  /  →", "Back 15s / forward 30s"],
              ["B", "Bookmark this moment"],
            ].map(([k, desc]) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="text-muted-foreground">{desc}</dt>
                <dd>
                  <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
