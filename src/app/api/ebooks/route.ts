import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

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

  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const storedName = `${crypto.randomUUID()}.epub`;
  const filePath = path.join(STORAGE_DIR, storedName);
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const ebook = await prisma.ebook.create({
    data: { bookId, fileName: file.name, filePath: storedName, format: "epub" },
  });
  return NextResponse.json({ ebook });
}
