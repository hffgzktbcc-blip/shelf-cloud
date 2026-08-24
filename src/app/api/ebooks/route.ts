import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { putEbook } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const bookId = form.get("bookId");
  const file = form.get("file");

  if (typeof bookId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "bookId and file are required" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".epub")) {
    return NextResponse.json({ error: "Only .epub files are supported" }, { status: 400 });
  }

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const { key } = await putEbook(Buffer.from(await file.arrayBuffer()));

  const ebook = await prisma.ebook.create({
    data: { bookId, fileName: file.name, filePath: key, format: "epub" },
  });
  return NextResponse.json({ ebook });
}
