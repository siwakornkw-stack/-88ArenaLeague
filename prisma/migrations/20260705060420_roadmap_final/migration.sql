-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'INJURY';

-- AlterTable
ALTER TABLE "AdminLog" ADD COLUMN     "leagueId" TEXT;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rulesUrl" TEXT;

-- AlterTable
ALTER TABLE "LeagueNews" ADD COLUMN     "publishAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LeagueSponsor" ADD COLUMN     "clicks" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MatchLineup" ADD COLUMN     "shirtNumber" INTEGER;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "weightKg" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
