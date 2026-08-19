import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = [
  "youtubeApiKey",
  "googleBooksApiKey",
  "koboSyncToken",
  "playbackPrefs",
  "playbackRate",
  "sleepTimerMin",
  "theme",
  "welcomeSeen",
] as const;

export async function GET() {
  const rows = await prisma.setting.findMany();
  const settings: Record<string, string> = {};
  // Every credential is masked, not just the first one that happened to be added —
  // this endpoint was returning the Anthropic key in full to any caller.
  const secret = new Set(["youtubeApiKey", "anthropicApiKey", "googleBooksApiKey", "koboSyncToken"]);
  for (const row of rows) {
    settings[row.key] = secret.has(row.key) ? maskKey(row.value) : row.value;
  }
  return NextResponse.json({
    settings,
    hasApiKey: rows.some((r) => r.key === "youtubeApiKey" && r.value),
    hasGoogleKey: rows.some((r) => r.key === "googleBooksApiKey" && r.value),
  });
}

function maskKey(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

const putSchema = z.object({
  key: z.enum(ALLOWED),
  value: z.string(),
});

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid setting" }, { status: 400 });

  const { key, value } = parsed.data;
  if (!value.trim()) {
    await prisma.setting.deleteMany({ where: { key } });
    return NextResponse.json({ ok: true, cleared: true });
  }

  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  return NextResponse.json({ ok: true });
}
