"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookAudio, ChartNoAxesColumn, FileText, Library, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Library", icon: Library },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/ebooks", label: "Ebooks", icon: FileText },
  { href: "/stats", label: "Stats", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <BookAudio className="text-primary size-5" />
          <span>Shelf</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
