import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const shelves = await prisma.shelf.findMany({
    orderBy: { order: "asc" },
    include: { books: { select: { bookId: true } } },
  });
  return NextResponse.json({ shelves });
}

const bodySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  shelfId: z.string().optional(),
  bookId: z.string().optional(),
});

/** Create a shelf, or put a book on one. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { name, shelfId, bookId } = parsed.data;

  if (name) {
    const last = await prisma.shelf.findFirst({ orderBy: { order: "desc" } });
    const shelf = await prisma.shelf.create({
      data: { name: name.trim(), order: (last?.order ?? -1) + 1 },
    });
    return NextResponse.json({ shelf });
  }

  if (shelfId && bookId) {
    await prisma.shelfBook.upsert({
      where: { shelfId_bookId: { shelfId, bookId } },
      create: { shelfId, bookId },
      update: {},
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Pass a name, or a shelfId and bookId" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const shelfId = url.searchParams.get("shelfId");
  const bookId = url.searchParams.get("bookId");
  if (!shelfId) return NextResponse.json({ error: "shelfId required" }, { status: 400 });

  // Without a book, the whole shelf goes; with one, just that book comes off it.
  if (bookId) await prisma.shelfBook.deleteMany({ where: { shelfId, bookId } });
  else await prisma.shelf.delete({ where: { id: shelfId } });

  return NextResponse.json({ ok: true });
}
