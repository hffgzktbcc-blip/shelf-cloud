-- AlterTable
ALTER TABLE "Ebook" ADD COLUMN "blockIndex" INTEGER;
ALTER TABLE "Ebook" ADD COLUMN "blocksJson" TEXT;

-- AlterTable
ALTER TABLE "SyncMark" ADD COLUMN "blockIndex" INTEGER;
