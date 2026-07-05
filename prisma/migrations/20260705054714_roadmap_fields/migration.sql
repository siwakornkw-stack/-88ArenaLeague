-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'PENALTY_MISSED';

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "registrationOpen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeagueNews" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "refereeName" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "nickname" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "coachName" TEXT,
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "homeVenue" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);
