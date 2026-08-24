import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEbook } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ebook = await prisma.ebook.findUnique({ where: { id } });
  if (!ebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await getEbook(ebook.filePath);
  if (!data) return NextResponse.json({ error: "File missing on disk" }, { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `inline; filename="${encodeURIComponent(ebook.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
