import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlayerClient } from "./player-client";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: PageProps<"/book/[id]/play/[partId]">) {
  const { id, partId } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      parts: { orderBy: { order: "asc" }, include: { chapters: { orderBy: { order: "asc" } } } },
      ebooks: { include: { syncMarks: true } },
      bookmarks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!book) notFound();

  const part = book.parts.find((p) => p.id === partId);
  if (!part) notFound();

  return (
    <PlayerClient
      book={JSON.parse(JSON.stringify(book))}
      initialPartId={part.id}
    />
  );
}
