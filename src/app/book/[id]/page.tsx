import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buyLinks } from "@/lib/youtube";
import { BookClient } from "./book-client";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: PageProps<"/book/[id]">) {
  const { id } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      parts: { orderBy: { order: "asc" }, include: { chapters: { orderBy: { order: "asc" } } } },
      ebooks: { include: { syncMarks: true } },
      bookmarks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!book) notFound();

  return (
    <BookClient
      book={JSON.parse(JSON.stringify(book))}
      links={buyLinks(book.title, book.author)}
    />
  );
}
