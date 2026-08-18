const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export type ParsedChapter = { title: string; startSec: number; order: number };

export type VideoMeta = {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  duration: number;
  thumbUrl: string;
  chapters: ParsedChapter[];
};

export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = url.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

export function extractPlaylistId(input: string): string | null {
  try {
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    const list = url.searchParams.get("list");
    return list && /^[\w-]+$/.test(list) ? list : null;
  } catch {
    return null;
  }
}

function timeToSeconds(stamp: string): number {
  const parts = stamp.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return -1;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return -1;
}

export function parseChaptersFromDescription(description: string, duration: number): ParsedChapter[] {
  const lines = description.split(/\r?\n/);
  const found: { title: string; startSec: number }[] = [];

  for (const line of lines) {
    const m = line.match(/(?:^|[\s([\-–—|])((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[\s)\]\-–—|.:]+|$)/);
    if (!m) continue;
    const startSec = timeToSeconds(m[1]);
    if (startSec < 0) continue;
    if (duration > 0 && startSec > duration) continue;

    let title = line
      .replace(m[0], " ")
      .replace(/^[\s\-–—|.:•*)\]]+/, "")
      .replace(/[\s\-–—|]+$/, "")
      .trim();
    if (!title) title = `Chapter ${found.length + 1}`;
    found.push({ title, startSec });
  }

  const seen = new Set<number>();
  const deduped = found.filter((c) => {
    if (seen.has(c.startSec)) return false;
    seen.add(c.startSec);
    return true;
  });

  if (deduped.length < 2) return [];

  deduped.sort((a, b) => a.startSec - b.startSec);
  return deduped.map((c, i) => ({ ...c, order: i }));
}

function findJson(html: string, marker: string): unknown | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function chaptersFromPlayerMarkers(initialData: any): ParsedChapter[] {
  const markersList = initialData?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer
    ?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap;
  if (!Array.isArray(markersList)) return [];
  for (const entry of markersList) {
    const markers = entry?.value?.chapters;
    if (!Array.isArray(markers) || markers.length < 2) continue;
    return markers.map((m: any, i: number) => ({
      title: m?.chapterRenderer?.title?.simpleText ?? `Chapter ${i + 1}`,
      startSec: Number(m?.chapterRenderer?.timeRangeStartMillis ?? 0) / 1000,
      order: i,
    }));
  }
  return [];
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  const html = await res.text();

  const playerResponse = findJson(html, "ytInitialPlayerResponse") as any;
  const initialData = findJson(html, "var ytInitialData") ?? findJson(html, "ytInitialData");

  const details = playerResponse?.videoDetails;
  if (!details) throw new Error("Could not read video details (video may be private or age-restricted)");

  const title: string = details.title ?? "Untitled";
  const channel: string = details.author ?? "";
  const description: string = details.shortDescription ?? "";
  const duration = Number(details.lengthSeconds ?? 0);

  const thumbs = details.thumbnail?.thumbnails ?? [];
  const thumbUrl =
    thumbs.length > 0
      ? thumbs[thumbs.length - 1].url
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  let chapters = chaptersFromPlayerMarkers(initialData);
  if (chapters.length === 0) chapters = parseChaptersFromDescription(description, duration);

  return { videoId, title, channel, description, duration, thumbUrl, chapters };
}

export type TranscriptCue = { start: number; dur: number; text: string };

/**
 * YouTube's public timedtext endpoint now returns empty bodies for plain server-side
 * requests, so this delegates to youtube-transcript, which uses the InnerTube client.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptCue[]> {
  const { YoutubeTranscript } = await import("youtube-transcript");
  const raw = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" }).catch(() =>
    YoutubeTranscript.fetchTranscript(videoId),
  );
  return raw
    .map((c) => ({
      start: c.offset / 1000,
      dur: c.duration / 1000,
      text: c.text.replace(/\s+/g, " ").trim(),
    }))
    .filter((c) => c.text.length > 0);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function buyLinks(title: string, author?: string | null) {
  const q = encodeURIComponent([title, author].filter(Boolean).join(" "));
  return [
    { name: "Audible", url: `https://www.audible.com/search?keywords=${q}` },
    { name: "Amazon", url: `https://www.amazon.com/s?k=${q}&i=stripbooks` },
    { name: "Kobo", url: `https://www.kobo.com/search?query=${q}` },
    { name: "Libro.fm", url: `https://libro.fm/search?utf8=%E2%9C%93&q=${q}` },
    { name: "Bookshop.org", url: `https://bookshop.org/beta-search?keywords=${q}` },
    { name: "Google Books", url: `https://www.google.com/search?tbm=bks&q=${q}` },
  ];
}
