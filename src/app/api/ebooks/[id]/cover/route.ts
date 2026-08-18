import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractEpubCover } from "@/lib/epub-cover";

export const runtime = "nodejs";

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ebook = await prisma.ebook.findUnique({ where: { id } });
  if (!ebook?.filePath) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let cover;
  try {
    cover = await extractEpubCover(path.join(STORAGE_DIR, ebook.filePath));
  } catch (e) {
    // A read or zip failure is a different problem from "this EPUB has no cover".
    return NextResponse.json({ error: `Could not read the EPUB: ${(e as Error).message}` }, { status: 500 });
  }
  if (!cover) return NextResponse.json({ error: "No cover image in this EPUB" }, { status: 404 });

  return new NextResponse(new Uint8Array(cover.data), {
    headers: {
      "Content-Type": cover.contentType,
      // The uploaded file never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
