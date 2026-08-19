-- CreateTable
CREATE TABLE "ListeningSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT,
    "partId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "rateSum" REAL NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "ListeningSession_startedAt_idx" ON "ListeningSession"("startedAt");
