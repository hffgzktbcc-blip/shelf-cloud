import { prisma } from "@/lib/db";
import { PREFS_KEY, parsePrefs } from "@/lib/prefs";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Shelf" };

export default async function SettingsPage() {
  const [key, googleKey, syncToken, prefsRow, books, parts, bookmarksCount, ebooks] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "youtubeApiKey" } }),
    prisma.setting.findUnique({ where: { key: "googleBooksApiKey" } }),
    prisma.setting.findUnique({ where: { key: "koboSyncToken" } }),
    prisma.setting.findUnique({ where: { key: PREFS_KEY } }),
    prisma.book.count(),
    prisma.part.count(),
    prisma.bookmark.count(),
    prisma.ebook.count(),
  ]);

  return (
    <SettingsClient
      hasApiKey={Boolean(key?.value)}
      hasGoogleKey={Boolean(googleKey?.value)}
      koboSyncConfigured={Boolean(syncToken?.value)}
      prefs={parsePrefs(prefsRow?.value)}
      stats={{ books, parts, bookmarks: bookmarksCount, ebooks }}
    />
  );
}
