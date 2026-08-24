import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { deleteEbook } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  cfi: z.string().optional(),
  blockIndex: z.number().int().min(0).optional(),
  progress: z.number().min(0).max(1).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const ebook = await prisma.ebook.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ebook });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ebook = await prisma.ebook.delete({ where: { id } });
  await deleteEbook(ebook.filePath);
  return NextResponse.json({ ok: true });
}
