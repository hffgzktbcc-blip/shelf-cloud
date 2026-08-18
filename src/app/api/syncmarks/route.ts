import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  ebookId: z.string(),
  partId: z.string(),
  timeSec: z.number().min(0),
  cfi: z.string().min(1),
  label: z.string().nullish(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const syncMark = await prisma.syncMark.create({ data: parsed.data });
  return NextResponse.json({ syncMark });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.syncMark.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
