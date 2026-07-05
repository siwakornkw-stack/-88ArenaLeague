import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";

export type FeaturedLeague = {
  id: string;
  name: string;
  type: string;
  teams: number;
  round: number;
  totalRounds: number;
  live: number;
  leaderName: string | null;
  leaderPoints: number;
  top3: { name: string; points: number }[];
  registrationOpen: boolean;
};

export async function getFeaturedLeagues(limit = 3): Promise<FeaturedLeague[]> {
  const leagues = await prisma.league.findMany({
    where: { status: { not: "DRAFT" } },
    include: { teams: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Promise.all(
    leagues.map(async (league) => {
      const matches = await prisma.match.findMany({
        where: { leagueId: league.id },
        select: { round: true, status: true },
      });
      const totalRounds = matches.reduce((max, m) => Math.max(max, m.round), 0);
      const liveCount = matches.filter((m) => m.status === "LIVE").length;
      const activeMatch = matches.find((m) => m.status !== "FINISHED");
      const round = activeMatch ? activeMatch.round : totalRounds;

      const standings = await computeStandings(league.id);
      const leader = standings[0];

      return {
        id: league.id,
        name: league.name,
        type: league.type,
        teams: league.teams.length,
        round,
        totalRounds,
        live: liveCount,
        leaderName: leader?.teamName ?? null,
        leaderPoints: leader?.points ?? 0,
        top3: standings.slice(0, 3).map((r) => ({ name: r.teamName, points: r.points })),
        registrationOpen: league.registrationOpen,
      };
    })
  );
}
