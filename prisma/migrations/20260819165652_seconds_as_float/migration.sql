-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ListeningDay" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "seconds" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_ListeningDay" ("date", "seconds") SELECT "date", "seconds" FROM "ListeningDay";
DROP TABLE "ListeningDay";
ALTER TABLE "new_ListeningDay" RENAME TO "ListeningDay";
CREATE TABLE "new_ListeningSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT,
    "partId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seconds" REAL NOT NULL DEFAULT 0,
    "rateSum" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_ListeningSession" ("bookId", "endedAt", "id", "partId", "rateSum", "seconds", "startedAt") SELECT "bookId", "endedAt", "id", "partId", "rateSum", "seconds", "startedAt" FROM "ListeningSession";
DROP TABLE "ListeningSession";
ALTER TABLE "new_ListeningSession" RENAME TO "ListeningSession";
CREATE INDEX "ListeningSession_startedAt_idx" ON "ListeningSession"("startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

