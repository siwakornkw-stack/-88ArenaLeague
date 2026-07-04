-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'SUBSTITUTION';

-- AlterTable
ALTER TABLE "MatchEvent" ADD COLUMN     "relatedPlayerId" TEXT;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_relatedPlayerId_fkey" FOREIGN KEY ("relatedPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
