import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SiteNav } from "@/components/site-nav";
import { PlayerProvider } from "@/components/player-provider";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
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
