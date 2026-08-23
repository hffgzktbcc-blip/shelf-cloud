import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SiteNav } from "@/components/site-nav";
import { PlayerProvider } from "@/components/player-provider";
import { prisma } from "@/lib/db";
import { PREFS_KEY, parsePrefs } from "@/lib/prefs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shelf — Audiobook Player",
  description: "A personal audiobook player for YouTube audiobooks and your own ebooks.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read on the server so the accent is already right in the first paint — set it in the
  // browser instead and every page load starts neutral and flicks to bronze.
  const prefsRow = await prisma.setting.findUnique({ where: { key: PREFS_KEY } });
  const { accent } = parsePrefs(prefsRow?.value);

  return (
    <html
      lang="en"
      data-accent={accent}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {/* The player lives above the router so navigating never unmounts the iframe. */}
        <PlayerProvider>
          <SiteNav />
          <main className="flex-1">{children}</main>
        </PlayerProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
