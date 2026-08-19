import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.queueItem.findMany({
    orderBy: { order: "asc" },
    include: { book: { include: { parts: true } } },
  });
  return NextResponse.json({ items });
}

const addSchema = z.object({ bookId: z.string() });

export async function POST(req: Request) {
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const last = await prisma.queueItem.findFirst({ orderBy: { order: "desc" } });
  const item = await prisma.queueItem.upsert({
    where: { bookId: parsed.data.bookId },
    create: { bookId: parsed.data.bookId, order: (last?.order ?? -1) + 1 },
    update: {},
  });
  return NextResponse.json({ item });
}

const reorderSchema = z.object({ order: z.array(z.string()) });

/** Persist a new running order after a drag. */
export async function PATCH(req: Request) {
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await prisma.$transaction(
    parsed.data.order.map((bookId, i) =>
      prisma.queueItem.update({ where: { bookId }, data: { order: i } }),
    ),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const bookId = new URL(req.url).searchParams.get("bookId");
  if (!bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });
  await prisma.queueItem.deleteMany({ where: { bookId } });
  return NextResponse.json({ ok: true });
}
