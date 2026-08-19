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

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * One row of five labelled links doesn't fit a phone — it neither wrapped nor scrolled, so
 * Settings simply sat outside the viewport. Below `md` the header keeps only the title and
 * the links become a bottom tab bar with full-height targets.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <>
      <header className="border-border/60 bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <BookAudio className="text-position size-5" />
            <span>Shelf</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
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

      <nav className="border-border/60 bg-background/95 fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t backdrop-blur md:hidden">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "text-position")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Room for the tab bar, which is fixed. */}
      <div className="h-14 md:hidden" aria-hidden />
    </>
  );
}
