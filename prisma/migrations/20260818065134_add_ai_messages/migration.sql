-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "timeSec" REAL NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ask',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiMessage_bookId_createdAt_idx" ON "AiMessage"("bookId", "createdAt");
