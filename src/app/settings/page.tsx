import { prisma } from "@/lib/db";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Shelf" };

export default async function SettingsPage() {
  const [key, books, parts, bookmarksCount, ebooks] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "youtubeApiKey" } }),
    prisma.book.count(),
    prisma.part.count(),
    prisma.bookmark.count(),
    prisma.ebook.count(),
  ]);

  return (
    <SettingsClient
      hasApiKey={Boolean(key?.value)}
      stats={{ books, parts, bookmarks: bookmarksCount, ebooks }}
    />
  );
}
