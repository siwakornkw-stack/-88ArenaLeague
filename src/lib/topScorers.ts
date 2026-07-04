import { prisma } from "@/lib/db";

export type TopScorerRow = {
  playerId: string;
  playerName: string;
  teamName: string;
  goals: number;
};

export async function getTopAssists(leagueId: string, limit = 5): Promise<TopScorerRow[]> {
  const grouped = await prisma.matchEvent.groupBy({
    by: ["relatedPlayerId"],
    where: { type: "GOAL", relatedPlayerId: { not: null }, match: { leagueId } },
    _count: { relatedPlayerId: true },
    orderBy: { _count: { relatedPlayerId: "desc" } },
    take: limit,
  });

  const players = await prisma.player.findMany({
    where: { id: { in: grouped.map((g) => g.relatedPlayerId!) } },
    include: { team: true },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  return grouped
    .map((g) => {
      const player = playerById.get(g.relatedPlayerId!);
      if (!player) return null;
      return {
        playerId: player.id,
        playerName: player.name,
        teamName: player.team.name,
        goals: g._count.relatedPlayerId,
      };
    })
    .filter((row): row is TopScorerRow => row !== null);
}

export async function getTopScorers(leagueId: string, limit = 5): Promise<TopScorerRow[]> {
  const grouped = await prisma.matchEvent.groupBy({
    by: ["playerId"],
    where: { type: "GOAL", playerId: { not: null }, match: { leagueId } },
    _count: { playerId: true },
    orderBy: { _count: { playerId: "desc" } },
    take: limit,
  });

  const players = await prisma.player.findMany({
    where: { id: { in: grouped.map((g) => g.playerId!) } },
    include: { team: true },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  return grouped
    .map((g) => {
      const player = playerById.get(g.playerId!);
      if (!player) return null;
      return {
        playerId: player.id,
        playerName: player.name,
        teamName: player.team.name,
        goals: g._count.playerId,
      };
    })
    .filter((row): row is TopScorerRow => row !== null);
}
