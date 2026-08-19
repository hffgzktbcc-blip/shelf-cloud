-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueueItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShelfBook" (
    "shelfId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("shelfId", "bookId"),
    CONSTRAINT "ShelfBook_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShelfBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueItem_bookId_key" ON "QueueItem"("bookId");

-- CreateIndex
CREATE INDEX "QueueItem_order_idx" ON "QueueItem"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_name_key" ON "Shelf"("name");
