import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      parts: { orderBy: { order: "asc" }, include: { chapters: { orderBy: { order: "asc" } } } },
      ebooks: { include: { syncMarks: { orderBy: { timeSec: "asc" } } } },
      bookmarks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ book });
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().optional(),
  narrator: z.string().optional(),
  series: z.string().optional(),
  coverUrl: z.string().optional(),
  finished: z.boolean().optional(),
  favorite: z.boolean().optional(),
  lastPartId: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const book = await prisma.book.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ book });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
