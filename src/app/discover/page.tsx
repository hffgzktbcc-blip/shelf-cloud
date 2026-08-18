import { prisma } from "@/lib/db";
import { DiscoverClient } from "./discover-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discover — Shelf" };

/** Channel names that are the uploader rather than a person worth following. */
const GENERIC = /^(audiobook|audio ?books?|full audiobook)s?$/i;

export default async function DiscoverPage() {
  const [books, parts] = await Promise.all([
    prisma.book.findMany({ select: { author: true } }),
    prisma.part.findMany({ select: { channel: true } }),
  ]);

  // The stored "author" is sometimes the uploading channel, so anything that also appears
  // as a channel is dropped — searching for it would just find the same uploads again.
  const channels = new Set(parts.map((p) => p.channel).filter(Boolean) as string[]);

  const authors = [...new Set(books.map((b) => b.author).filter(Boolean) as string[])]
    .filter((a) => !channels.has(a) && !GENERIC.test(a))
    .slice(0, 6);

  const narrators = [...channels].filter((c) => !GENERIC.test(c)).slice(0, 6);

  return <DiscoverClient suggestions={{ authors, narrators }} />;
}
