"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookImage,
  ChartNoAxesColumn,
  Check,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Radio,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Props = {
  hasApiKey: boolean;
  hasGoogleKey: boolean;
  koboSyncConfigured: boolean;
  prefs: Prefs;
  stats: { books: number; parts: number; bookmarks: number; ebooks: number };
};

export function SettingsClient({ hasApiKey, hasGoogleKey, koboSyncConfigured, prefs: initialPrefs, stats }: Props) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function saveKey(settingKey: "youtubeApiKey" | "googleBooksApiKey", value: string) {
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
      setGoogleKey("");
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

      <PlaybackCard initial={initialPrefs} />

      <KoboSyncCard configured={koboSyncConfigured} />

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
          <CardTitle className="flex items-center gap-2 text-base">
            <BookImage className="size-4" />
            Google Books API key
            {hasGoogleKey && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Check className="size-3" />
                Set
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Cover lookup works without it — your EPUBs, Open Library and Apple Books need no
            key. This only adds Google Books, whose keyless quota is shared and usually spent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="google-key">API key</Label>
            <div className="flex gap-2">
              <Input
                id="google-key"
                type="password"
                value={googleKey}
                onChange={(e) => setGoogleKey(e.target.value)}
                placeholder={hasGoogleKey ? "••••••••••••••••" : "Paste your key"}
              />
              <Button
                onClick={() => saveKey("googleBooksApiKey", googleKey)}
                disabled={saving !== null || !googleKey.trim()}
              >
                {saving === "googleBooksApiKey" ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              Get a key from Google Cloud Console
              <ExternalLink className="size-3" />
            </a>
            {hasGoogleKey && (
              <button
                onClick={() => saveKey("googleBooksApiKey", "")}
                className="text-muted-foreground hover:text-destructive text-xs"
              >
                Clear key
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Your library</CardTitle>
          <CardDescription>
            {stats.books} books · {stats.parts} parts · {stats.bookmarks} bookmarks ·{" "}
            {stats.ebooks} ebooks
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/stats">
              <ChartNoAxesColumn className="size-3.5" />
              Listening stats
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/ebooks">
              <FileText className="size-3.5" />
              Ebook files
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/welcome">
              <Sparkles className="size-3.5" />
              Replay the welcome tour
            </Link>
          </Button>
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
                  <kbd className="bg-muted rounded-md border px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function KoboSyncCard({ configured }: { configured: boolean }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function createToken() {
    setSaving(true);
    const next = crypto.randomUUID().replaceAll("-", "");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "koboSyncToken", value: next }),
      });
      if (!res.ok) throw new Error("Could not create sync token");
      setToken(next);
      setConfirming(false);
      toast.success(configured ? "New token created — update the Kobo" : "Kobo sync token created");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="size-4" />
          Kobo wireless sync
          {configured && (
            <Badge variant="secondary" className="gap-1">
              <Check className="size-3" />
              Set up
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          A small Kobo-side client sends reading positions here over Wi-Fi. It doesn&apos;t
          launch KOReader or change how the Kobo reader works.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="bg-muted rounded-md px-3 py-2 font-mono text-xs break-all">
          /api/kobo/sync
        </div>

        {token ? (
          <div className="space-y-1">
            <Label htmlFor="kobo-token">Copy this into shelf-sync.conf on the Kobo</Label>
            <Input id="kobo-token" readOnly value={token} onFocus={(e) => e.target.select()} />
            <p className="text-subtle-foreground text-xs">
              This is the only time it&apos;s shown.
            </p>
          </div>
        ) : configured ? (
          // The token deliberately isn't shown again, which reads as "it reset" — and the
          // obvious next move, pressing the button, silently replaces it and cuts the Kobo
          // off. Say plainly that nothing is wrong.
          <p className="text-muted-foreground text-sm leading-relaxed">
            A token exists and the Kobo is using it. It isn&apos;t shown again after it&apos;s
            created, so this staying blank between restarts is normal — nothing has been lost.
          </p>
        ) : null}

        {!configured ? (
          <Button variant="secondary" size="sm" onClick={createToken} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Create sync token
          </Button>
        ) : confirming ? (
          <div className="border-destructive/40 space-y-2 rounded-md border p-3">
            <p className="text-sm">
              Replace the token? The Kobo will be turned away until you copy the new one into
              <code className="bg-muted mx-1 rounded-md px-1">shelf-sync.conf</code>.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={createToken} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Replace it
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep the current one
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Replace token…
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Playback behaviour. Everything here is something the embedded player can actually do;
 * silence trimming and volume boost are named in the note rather than offered, because a
 * cross-origin embed never hands over the audio to process.
 */
function PlaybackCard({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saving, setSaving] = useState(false);

  async function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "playbackPrefs", value: JSON.stringify(next) }),
      });
      if (!res.ok) throw new Error("Could not save");
    } catch {
      setPrefs(prefs);
      toast.error("Could not save that");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4" />
          Playback
          {saving && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
        </CardTitle>
        <CardDescription>
          Applies everywhere — the transport, the docked bar and the keyboard shortcuts.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <Choice
          label="Skip back"
          hint="The left arrow on the transport, and ←"
          value={prefs.skipBack}
          options={[10, 15, 30, 60]}
          format={(v) => `${v}s`}
          onPick={(v) => update("skipBack", v)}
        />
        <Choice
          label="Skip forward"
          hint="The right arrow, and →"
          value={prefs.skipForward}
          options={[10, 15, 30, 60]}
          format={(v) => `${v}s`}
          onPick={(v) => update("skipForward", v)}
        />
        <Choice
          label="Speed for new books"
          hint="A book keeps its own speed once you change it"
          value={prefs.defaultSpeed}
          options={[1, 1.1, 1.25, 1.5, 1.75, 2]}
          format={(v) => `${v}×`}
          onPick={(v) => update("defaultSpeed", v)}
        />
        <Choice
          label="Rewind on resume"
          hint="Steps back a little when you pick a book up again"
          value={prefs.rewindOnResume}
          options={[0, 5, 10, 15, 30]}
          format={(v) => (v === 0 ? "Off" : `${v}s`)}
          onPick={(v) => update("rewindOnResume", v)}
        />
        <Choice
          label="Sleep timer default"
          hint="What the Sleep button offers first"
          value={prefs.sleepDefaultMin}
          options={[10, 15, 30, 45, 60]}
          format={(v) => `${v}m`}
          onPick={(v) => update("sleepDefaultMin", v)}
        />

        <Toggle
          label="Fade out on sleep"
          hint="Ramps the volume down over the last few seconds instead of cutting"
          checked={prefs.fadeOnSleep}
          onChange={(v) => update("fadeOnSleep", v)}
        />
        <Toggle
          label="Auto-play the next part"
          hint="Rolls straight on when a part ends"
          checked={prefs.autoPlayNext}
          onChange={(v) => update("autoPlayNext", v)}
        />

        <p className="text-subtle-foreground border-t pt-4 text-xs leading-relaxed">
          Silence trimming and volume boost aren&apos;t offered because they need the raw
          audio, and an embedded YouTube player never hands it over — the same limit that
          stops playback continuing when your phone locks.
        </p>
      </CardContent>
    </Card>
  );
}

function Choice<T extends number>({
  label,
  hint,
  value,
  options,
  format,
  onPick,
}: {
  label: string;
  hint: string;
  value: T;
  options: T[];
  format: (v: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-subtle-foreground text-xs">{hint}</p>
      </div>
      <div className="bg-secondary flex shrink-0 rounded-md p-0.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onPick(o)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs tabular-nums transition-colors",
              o === value ? "bg-background text-foreground" : "text-muted-foreground",
            )}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-subtle-foreground block text-xs">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-position size-4 shrink-0"
      />
    </label>
  );
}
