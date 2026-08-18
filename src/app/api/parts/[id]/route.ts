import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  positionSec: z.number().min(0).optional(),
  completed: z.boolean().optional(),
  title: z.string().min(1).optional(),
  duration: z.number().min(0).optional(),
});

/**
 * Credits time actually listened to today's tally.
 *
 * The player saves its position every few seconds, so the gap between saves is time spent
 * listening. Seeks and part changes produce large or negative gaps, which are ignored —
 * only forward movement at roughly real speed counts, capped so a long pause with the tab
 * closed can't be banked as listening.
 */
const MAX_CREDIT_SEC = 60;

async function creditListening(previousSec: number, nextSec: number) {
  const delta = nextSec - previousSec;
  if (delta <= 0 || delta > MAX_CREDIT_SEC) return;

  const date = new Date().toLocaleDateString("en-CA");
  await prisma.listeningDay.upsert({
    where: { date },
    create: { date, seconds: Math.round(delta) },
    update: { seconds: { increment: Math.round(delta) } },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const before =
    parsed.data.positionSec !== undefined
      ? await prisma.part.findUnique({ where: { id }, select: { positionSec: true } })
      : null;

  const part = await prisma.part.update({ where: { id }, data: parsed.data });

  if (before && parsed.data.positionSec !== undefined) {
    await creditListening(before.positionSec, parsed.data.positionSec);
  }
  await prisma.book.update({
    where: { id: part.bookId },
    data: { lastPartId: part.id },
  });
  return NextResponse.json({ part });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const part = await prisma.part.delete({ where: { id } });
  const remaining = await prisma.part.findMany({
    where: { bookId: part.bookId },
    orderBy: { order: "asc" },
  });
  await prisma.$transaction(
    remaining.map((p, i) => prisma.part.update({ where: { id: p.id }, data: { order: i } })),
  );
  return NextResponse.json({ ok: true });
}
