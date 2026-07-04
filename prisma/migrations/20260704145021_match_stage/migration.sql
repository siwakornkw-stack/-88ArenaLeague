-- CreateEnum
CREATE TYPE "MatchStage" AS ENUM ('LEAGUE', 'SEMI_FINAL', 'FINAL');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "stage" "MatchStage" NOT NULL DEFAULT 'LEAGUE';
