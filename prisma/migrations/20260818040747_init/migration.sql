-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "coverUrl" TEXT,
    "narrator" TEXT,
    "series" TEXT,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastPartId" TEXT
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "thumbUrl" TEXT,
    "channel" TEXT,
    "positionSec" REAL NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcriptJson" TEXT,
    "transcriptState" TEXT NOT NULL DEFAULT 'unknown',
    CONSTRAINT "Part_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSec" REAL NOT NULL,
    "endSec" REAL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "Chapter_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ebook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'epub',
    "cfi" TEXT,
    "progress" REAL NOT NULL DEFAULT 0,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ebook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncMark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ebookId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "timeSec" REAL NOT NULL,
    "cfi" TEXT NOT NULL,
    "label" TEXT,
    CONSTRAINT "SyncMark_ebookId_fkey" FOREIGN KEY ("ebookId") REFERENCES "Ebook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "timeSec" REAL NOT NULL,
    "note" TEXT,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bookmark_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Part_bookId_order_idx" ON "Part"("bookId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Part_bookId_videoId_key" ON "Part"("bookId", "videoId");

-- CreateIndex
CREATE INDEX "Chapter_partId_order_idx" ON "Chapter"("partId", "order");

-- CreateIndex
CREATE INDEX "SyncMark_ebookId_timeSec_idx" ON "SyncMark"("ebookId", "timeSec");

-- CreateIndex
CREATE INDEX "Bookmark_bookId_createdAt_idx" ON "Bookmark"("bookId", "createdAt");
