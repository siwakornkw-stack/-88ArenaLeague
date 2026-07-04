-- CreateTable
CREATE TABLE "LeagueSponsor" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueSponsor_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LeagueSponsor" ADD CONSTRAINT "LeagueSponsor_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
