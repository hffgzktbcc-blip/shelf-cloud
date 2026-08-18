import Link from "next/link";
import { redirect } from "next/navigation";
import { BookPlus, Bookmark, FileText, Headphones } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  // First run only: an empty shelf with no welcome on record.
  const seen = await prisma.setting.findUnique({ where: { key: "welcomeSeen" } });
  if (!seen) {
    const existing = await prisma.book.count();
    if (existing === 0) redirect("/welcome");
  }

  const books = await prisma.book.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      parts: { orderBy: { order: "asc" } },
      ebooks: { select: { id: true } },
      _count: { select: { bookmarks: true } },
    },
  });

  const withStats = books.map((book) => {
    const total = book.parts.reduce((sum, p) => sum + p.duration, 0);
    const listened = book.parts.reduce(
      (sum, p) => sum + (p.completed ? p.duration : p.positionSec),
      0,
    );
    const pct = total > 0 ? Math.min(100, (listened / total) * 100) : 0;
    const resumePart =
      book.parts.find((p) => p.id === book.lastPartId) ??
      book.parts.find((p) => !p.completed) ??
      book.parts[0];
    return { book, total, listened, pct, resumePart };
  });

  const inProgress = withStats.filter((b) => b.pct > 0.5 && b.pct < 99);
  const rest = withStats.filter((b) => !inProgress.includes(b));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your Library</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {books.length === 0
              ? "Nothing here yet — add your first audiobook."
              : `${books.length} ${books.length === 1 ? "book" : "books"} on the shelf`}
          </p>
        </div>
        <Button asChild>
          <Link href="/discover">
            <BookPlus className="size-4" />
            Add a book
          </Link>
        </Button>
      </div>

      {books.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-12">
          {inProgress.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-medium">Continue listening</h2>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                {inProgress.map((s) => (
                  <BookCard key={s.book.id} {...s} />
                ))}
              </div>
            </section>
          )}
          {rest.length > 0 && (
            <section>
              {inProgress.length > 0 && <h2 className="mb-4 text-lg font-medium">All books</h2>}
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                {rest.map((s) => (
                  <BookCard key={s.book.id} {...s} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-border/60 flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
      <Headphones className="text-muted-foreground/50 size-12" />
      <h2 className="mt-4 text-lg font-medium">No audiobooks yet</h2>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">
        Search YouTube from inside the app, or paste a link to any audiobook video. Chapters and
        transcripts get pulled in automatically.
      </p>
      <Button asChild className="mt-6">
        <Link href="/discover">
          <BookPlus className="size-4" />
          Find an audiobook
        </Link>
      </Button>
    </div>
  );
}

type CardProps = {
  book: {
    id: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    parts: { id: string }[];
    ebooks: { id: string }[];
    _count: { bookmarks: number };
  };
  total: number;
  pct: number;
  resumePart: { id: string } | undefined;
};

function BookCard({ book, total, pct, resumePart }: CardProps) {
  const href = resumePart ? `/book/${book.id}/play/${resumePart.id}` : `/book/${book.id}`;

  return (
    <Link href={href} className="group block">
      <div className="bg-muted relative aspect-square overflow-hidden rounded-lg shadow-sm ring-1 ring-white/5">
        {book.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverUrl}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <Headphones className="size-8" />
          </div>
        )}
        {pct > 0.5 && (
          <div className="absolute inset-x-0 bottom-0">
            <Progress value={pct} className="h-1 rounded-none" />
          </div>
        )}
      </div>
      <div className="mt-2.5">
        <h3 className="group-hover:text-primary line-clamp-2 text-sm leading-snug font-medium transition-colors">
          {book.title}
        </h3>
        {book.author && (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{book.author}</p>
        )}
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span>{formatDuration(total)}</span>
          {book.parts.length > 1 && (
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              {book.parts.length} parts
            </Badge>
          )}
          {book.ebooks.length > 0 && <FileText className="size-3" />}
          {book._count.bookmarks > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Bookmark className="size-3" />
              {book._count.bookmarks}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
