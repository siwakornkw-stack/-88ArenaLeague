-- AlterTable
ALTER TABLE "League" ADD COLUMN     "description" TEXT,
ADD COLUMN     "promotedCount" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "relegatedCount" INTEGER NOT NULL DEFAULT 2;
