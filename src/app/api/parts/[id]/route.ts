import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  positionSec: z.number().min(0).optional(),
  /** Playback rate at the moment of the save, so average speed reflects real listening. */
  rate: z.number().min(0.25).max(4).optional(),
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

/** A gap longer than this ends a session; the next save starts a new one. */
const SESSION_GAP_MS = 5 * 60 * 1000;

async function creditListening(
  previousSec: number,
  nextSec: number,
  ctx: { bookId: string; partId: string; rate: number },
) {
  const delta = nextSec - previousSec;
  if (delta <= 0 || delta > MAX_CREDIT_SEC) return;

  const seconds = Math.round(delta);
  const now = new Date();

  const date = now.toLocaleDateString("en-CA");
  await prisma.listeningDay.upsert({
    where: { date },
    create: { date, seconds },
    update: { seconds: { increment: seconds } },
  });

  // Extend the run in progress, or begin a new one if the last save was a while ago.
  const latest = await prisma.listeningSession.findFirst({ orderBy: { endedAt: "desc" } });
  const continues = latest && now.getTime() - latest.endedAt.getTime() < SESSION_GAP_MS;

  if (continues) {
    await prisma.listeningSession.update({
      where: { id: latest.id },
      data: {
        endedAt: now,
        seconds: { increment: seconds },
        rateSum: { increment: ctx.rate * seconds },
        bookId: ctx.bookId,
        partId: ctx.partId,
      },
    });
  } else {
    await prisma.listeningSession.create({
      data: {
        bookId: ctx.bookId,
        partId: ctx.partId,
        startedAt: now,
        endedAt: now,
        seconds,
        rateSum: ctx.rate * seconds,
      },
    });
  }
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

  const { rate: _rate, ...partData } = parsed.data;
  const part = await prisma.part.update({ where: { id }, data: partData });

  if (before && parsed.data.positionSec !== undefined) {
    await creditListening(before.positionSec, parsed.data.positionSec, {
      bookId: part.bookId,
      partId: part.id,
      rate: parsed.data.rate ?? 1,
    });
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
