import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ebookId: z.string(),
  partId: z.string(),
  replace: z.boolean().optional(),
  marks: z
    .array(
      z.object({
        timeSec: z.number().min(0),
        cfi: z.string().optional(),
        blockIndex: z.number().int().min(0).optional(),
      }),
    )
    .max(5000),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { ebookId, partId, marks, replace } = parsed.data;

  const ebook = await prisma.ebook.findUnique({ where: { id: ebookId } });
  if (!ebook) return NextResponse.json({ error: "Ebook not found" }, { status: 404 });

  const ops = [];
  if (replace) {
    ops.push(prisma.syncMark.deleteMany({ where: { ebookId, partId } }));
  }
  ops.push(
    prisma.syncMark.createMany({
      data: marks.map((m) => ({
        ebookId,
        partId,
        timeSec: m.timeSec,
        cfi: m.cfi ?? "",
        blockIndex: m.blockIndex ?? null,
        label: null,
      })),
    }),
  );

  await prisma.$transaction(ops);

  const saved = await prisma.syncMark.findMany({
    where: { ebookId, partId },
    orderBy: { timeSec: "asc" },
  });

  return NextResponse.json({ syncMarks: saved, added: marks.length });
}
