-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'OWN_GOAL';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "mvpPlayerId" TEXT;

-- CreateTable
CREATE TABLE "LeagueNews" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueNews_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LeagueNews" ADD CONSTRAINT "LeagueNews_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_mvpPlayerId_fkey" FOREIGN KEY ("mvpPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
