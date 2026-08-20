import { NextResponse } from "next/server";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { md5, putProgress, shelfPosition, type Progress } from "@/lib/kosync";
import { chapterHrefForBlock } from "@/lib/kobo-bookmark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  document: z.string().min(1).max(500),
  progress: z.string().optional().default(""),
  percentage: z.number().min(0).max(1),
  device: z.string().min(1).max(100).optional().default("Kobo"),
  device_id: z.string().max(200).optional(),
});

async function authorized(req: Request): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-sync-token");
  if (!token) return false;

  const row = await prisma.setting.findUnique({ where: { key: "koboSyncToken" } });
  return Boolean(row?.value && token === row.value);
}

function shelfDocument(document: string): string {
  if (!document.startsWith("file:")) return document;
  const fileName = path.basename(document.replace(/^file:\/\/+/, ""));
  return md5(fileName);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, service: "Shelf Kobo sync" });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sync payload" }, { status: 400 });

  const incoming = parsed.data.document;
  const label = incoming.startsWith("file:")
    ? path.basename(incoming.replace(/^file:\/\/+/, ""))
    : incoming;

  const progress: Progress = {
    ...parsed.data,
    document: shelfDocument(incoming),
    // The stored key is a hash; without this an unmatched sync is unidentifiable.
    label,
    timestamp: Math.floor(Date.now() / 1000),
  };
  await putProgress(progress);
  const shelf = await shelfPosition(progress.document);
  const shelfPct = shelf?.percentage ?? null;
  // Only follow Shelf's own mapped position when it's at least as far along as what the
  // Kobo just reported — an arbitrary Kobo-reported percentage has no block to bookmark.
  const chapterHref =
    shelf && shelfPct !== null && shelfPct >= progress.percentage
      ? await chapterHrefForBlock(shelf.ebookId, shelf.filePath, shelf.blockIndex)
      : null;

  return NextResponse.json({
    ok: true,
    document: progress.document,
    timestamp: progress.timestamp,
    shelfPercentage: shelfPct === null ? null : Math.max(shelfPct, progress.percentage),
    ...(chapterHref ? { chapterHref } : {}),
  });
}
