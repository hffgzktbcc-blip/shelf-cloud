-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "coverUrl" TEXT,
    "narrator" TEXT,
    "series" TEXT,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastPartId" TEXT,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "thumbUrl" TEXT,
    "channel" TEXT,
    "positionSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcriptJson" TEXT,
    "transcriptState" TEXT NOT NULL DEFAULT 'unknown',

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ebook" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'epub',
    "cfi" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocksJson" TEXT,
    "blockIndex" INTEGER,

    CONSTRAINT "Ebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncMark" (
    "id" TEXT NOT NULL,
    "ebookId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "timeSec" DOUBLE PRECISION NOT NULL,
    "cfi" TEXT NOT NULL,
    "blockIndex" INTEGER,
    "label" TEXT,

    CONSTRAINT "SyncMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "timeSec" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "label" TEXT,
    "quote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "timeSec" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ask',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ListeningDay" (
    "date" TEXT NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ListeningDay_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShelfBook" (
    "shelfId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShelfBook_pkey" PRIMARY KEY ("shelfId","bookId")
);

-- CreateTable
CREATE TABLE "ListeningSession" (
    "id" TEXT NOT NULL,
    "bookId" TEXT,
    "partId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rateSum" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ListeningSession_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "AiMessage_bookId_createdAt_idx" ON "AiMessage"("bookId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueItem_bookId_key" ON "QueueItem"("bookId");

-- CreateIndex
CREATE INDEX "QueueItem_order_idx" ON "QueueItem"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_name_key" ON "Shelf"("name");

-- CreateIndex
CREATE INDEX "ListeningSession_startedAt_idx" ON "ListeningSession"("startedAt");

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncMark" ADD CONSTRAINT "SyncMark_ebookId_fkey" FOREIGN KEY ("ebookId") REFERENCES "Ebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShelfBook" ADD CONSTRAINT "ShelfBook_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShelfBook" ADD CONSTRAINT "ShelfBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

