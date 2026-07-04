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

// goals + assists combined
export async function getGoalContributions(leagueId: string, limit = 10): Promise<TopScorerRow[]> {
  const [goals, assists] = await Promise.all([
    prisma.matchEvent.groupBy({
      by: ["playerId"],
      where: { type: "GOAL", playerId: { not: null }, match: { leagueId } },
      _count: { playerId: true },
    }),
    prisma.matchEvent.groupBy({
      by: ["relatedPlayerId"],
      where: { type: "GOAL", relatedPlayerId: { not: null }, match: { leagueId } },
      _count: { relatedPlayerId: true },
    }),
  ]);

  const totals = new Map<string, number>();
  for (const g of goals) totals.set(g.playerId!, (totals.get(g.playerId!) ?? 0) + g._count.playerId);
  for (const a of assists)
    totals.set(a.relatedPlayerId!, (totals.get(a.relatedPlayerId!) ?? 0) + a._count.relatedPlayerId);

  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const players = await prisma.player.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    include: { team: true },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  return top
    .map(([id, count]) => {
      const p = byId.get(id);
      if (!p) return null;
      return { playerId: p.id, playerName: p.name, teamName: p.team.name, goals: count };
    })
    .filter((r): r is TopScorerRow => r !== null);
}

export async function getTopMvps(leagueId: string, limit = 10): Promise<TopScorerRow[]> {
  const grouped = await prisma.match.groupBy({
    by: ["mvpPlayerId"],
    where: { leagueId, mvpPlayerId: { not: null } },
    _count: { mvpPlayerId: true },
    orderBy: { _count: { mvpPlayerId: "desc" } },
    take: limit,
  });

  const players = await prisma.player.findMany({
    where: { id: { in: grouped.map((g) => g.mvpPlayerId!) } },
    include: { team: true },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  return grouped
    .map((g) => {
      const player = playerById.get(g.mvpPlayerId!);
      if (!player) return null;
      return {
        playerId: player.id,
        playerName: player.name,
        teamName: player.team.name,
        goals: g._count.mvpPlayerId,
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
