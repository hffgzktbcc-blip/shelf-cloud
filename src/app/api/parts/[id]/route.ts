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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const part = await prisma.part.update({ where: { id }, data: parsed.data });
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
