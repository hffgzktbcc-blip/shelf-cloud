import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ebook = await prisma.ebook.findUnique({ where: { id } });
  if (!ebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = path.join(STORAGE_DIR, path.basename(ebook.filePath));
  const data = await fs.readFile(filePath).catch(() => null);
  if (!data) return NextResponse.json({ error: "File missing on disk" }, { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `inline; filename="${encodeURIComponent(ebook.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
