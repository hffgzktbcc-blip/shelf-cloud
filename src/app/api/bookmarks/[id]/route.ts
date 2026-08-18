import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  note: z.string().optional(),
  label: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const bookmark = await prisma.bookmark.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ bookmark });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.bookmark.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
