import { NextResponse } from "next/server";
import type { SearchHit } from "@/app/api/youtube/search/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

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
function collectVideos(node: any, out: SearchHit[], seen: Set<string>, limit: number) {
  if (!node || typeof node !== "object" || out.length >= limit) return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out, seen, limit);
    return;
  }
  const v = node.videoRenderer ?? node.compactVideoRenderer ?? node.playlistVideoRenderer;
  if (v?.videoId && !seen.has(v.videoId)) {
    const durationText: string =
      v.lengthText?.simpleText ??
      v.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText ??
      "";
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
  for (const key of Object.keys(node)) collectVideos(node[key], out, seen, limit);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function scrape(url: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  const html = await res.text();
  const data = findJson(html, "var ytInitialData") ?? findJson(html, "ytInitialData");
  const out: SearchHit[] = [];
  collectVideos(data, out, new Set(), limit);
  return out;
}

/**
 * Strips part/volume markers so "Dune Part 3 of 5" and "Dune Part 4" collapse to the
 * same stem, which is what makes later parts of a book findable from the one you have.
 */
function titleStem(title: string): string {
  return title
    .replace(/\(|\)|\[|\]/g, " ")
    .replace(/\b(part|pt\.?|vol\.?|volume|book|chapter|ch\.?|disc|cd|episode|ep\.?)\s*\d+\s*(of\s*\d+)?/gi, " ")
    .replace(/\b\d+\s*(of|\/)\s*\d+\b/g, " ")
    .replace(/\b(full|complete|unabridged|free|hd|audiobook|audio book)\b/gi, " ")
    .replace(/[|\-–—:•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const videoId = url.searchParams.get("videoId") ?? "";
  const title = url.searchParams.get("title") ?? "";
  const channel = url.searchParams.get("channel") ?? "";

  if (!/^[\w-]{11}$/.test(videoId) && !title) {
    return NextResponse.json({ error: "videoId or title required" }, { status: 400 });
  }

  const stem = titleStem(title);
  const query = [stem, channel].filter(Boolean).join(" ");

  try {
    const [related, sameSeries] = await Promise.allSettled([
      videoId
        ? scrape(`https://www.youtube.com/watch?v=${videoId}&hl=en`, 25)
        : Promise.resolve([] as SearchHit[]),
      query
        ? scrape(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&sp=EgIYAg%253D%253D`,
            25,
          )
        : Promise.resolve([] as SearchHit[]),
    ]);

    const seen = new Set<string>([videoId]);
    const merge = (hits: SearchHit[]) =>
      hits.filter((h) => {
        if (seen.has(h.videoId)) return false;
        seen.add(h.videoId);
        return true;
      });

    const seriesHits = sameSeries.status === "fulfilled" ? merge(sameSeries.value) : [];
    const relatedHits = related.status === "fulfilled" ? merge(related.value) : [];

    return NextResponse.json({
      stem,
      sameSeries: seriesHits.slice(0, 20),
      related: relatedHits.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
