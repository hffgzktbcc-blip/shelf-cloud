import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export type SearchHit = {
  videoId: string;
  title: string;
  channel: string;
  thumbUrl: string;
  durationText: string;
  durationSec: number;
};

function durationTextToSec(text: string): number {
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
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
function collectVideos(node: any, out: SearchHit[], seen: Set<string>) {
  if (!node || typeof node !== "object" || out.length >= 40) return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out, seen);
    return;
  }
  const v = node.videoRenderer;
  if (v?.videoId && !seen.has(v.videoId)) {
    const durationText: string =
      v.lengthText?.simpleText ?? v.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText ?? "";
    if (durationText) {
      seen.add(v.videoId);
      out.push({
        videoId: v.videoId,
        title: v.title?.runs?.[0]?.text ?? v.title?.simpleText ?? "Untitled",
        channel: v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text ?? "",
        thumbUrl: v.thumbnail?.thumbnails?.at(-1)?.url ?? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        durationText,
        durationSec: durationTextToSec(durationText),
      });
    }
  }
  for (const key of Object.keys(node)) collectVideos(node[key], out, seen);
}

async function searchViaApi(query: string, key: string): Promise<SearchHit[]> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "25");
  searchUrl.searchParams.set("key", key);

  const res = await fetch(searchUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`YouTube API error ${res.status}`);
  const data = await res.json();
  const ids: string[] = (data.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.searchParams.set("part", "snippet,contentDetails");
  detailsUrl.searchParams.set("id", ids.join(","));
  detailsUrl.searchParams.set("key", key);
  const dRes = await fetch(detailsUrl, { cache: "no-store" });
  const dData = await dRes.json();

  return (dData.items ?? []).map((item: any) => {
    const iso: string = item.contentDetails?.duration ?? "PT0S";
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const durationSec = m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
    const h = Math.floor(durationSec / 3600);
    const mm = Math.floor((durationSec % 3600) / 60);
    const ss = durationSec % 60;
    return {
      videoId: item.id,
      title: item.snippet?.title ?? "Untitled",
      channel: item.snippet?.channelTitle ?? "",
      thumbUrl:
        item.snippet?.thumbnails?.high?.url ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
      durationText: h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`,
      durationSec,
    };
  });
}

async function searchViaScrape(query: string): Promise<SearchHit[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&sp=EgIYAg%253D%253D`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  const html = await res.text();
  const data = findJson(html, "var ytInitialData") ?? findJson(html, "ytInitialData");
  const out: SearchHit[] = [];
  collectVideos(data, out, new Set());
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ items: [] });

  const longQuery = /audiobook|full book|unabridged/i.test(q) ? q : `${q} full audiobook`;

  const keyRow = await prisma.setting.findUnique({ where: { key: "youtubeApiKey" } });
  const key = keyRow?.value?.trim();

  try {
    const items = key ? await searchViaApi(longQuery, key) : await searchViaScrape(longQuery);
    return NextResponse.json({ items, source: key ? "api" : "scrape" });
  } catch (e) {
    if (key) {
      try {
        const items = await searchViaScrape(longQuery);
        return NextResponse.json({ items, source: "scrape", warning: (e as Error).message });
      } catch (e2) {
        return NextResponse.json({ error: (e2 as Error).message }, { status: 502 });
      }
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
