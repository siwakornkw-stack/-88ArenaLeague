import { prisma } from "@/lib/db";

export type TeamDisciplineRow = {
  teamId: string;
  teamName: string;
  yellow: number;
  red: number;
};

export type PlayerDisciplineRow = {
  playerId: string;
  playerName: string;
  teamName: string;
  yellow: number;
  red: number;
};

export async function getDiscipline(leagueId: string) {
  const [teams, events] = await Promise.all([
    prisma.team.findMany({ where: { leagueId } }),
    prisma.matchEvent.findMany({
      where: { type: { in: ["YELLOW_CARD", "RED_CARD"] }, match: { leagueId } },
      include: {
        match: { select: { homeTeamId: true, awayTeamId: true } },
        player: { include: { team: true } },
      },
    }),
  ]);

  const teamRows = new Map<string, TeamDisciplineRow>(
    teams.map((t) => [t.id, { teamId: t.id, teamName: t.name, yellow: 0, red: 0 }])
  );
  const playerRows = new Map<string, PlayerDisciplineRow>();

  for (const ev of events) {
    const teamId =
      ev.side === "HOME" ? ev.match.homeTeamId : ev.side === "AWAY" ? ev.match.awayTeamId : null;
    const teamRow = teamId ? teamRows.get(teamId) : null;
    if (teamRow) {
      if (ev.type === "YELLOW_CARD") teamRow.yellow++;
      else teamRow.red++;
    }

    if (ev.player) {
      let row = playerRows.get(ev.player.id);
      if (!row) {
        row = {
          playerId: ev.player.id,
          playerName: ev.player.name,
          teamName: ev.player.team.name,
          yellow: 0,
          red: 0,
        };
        playerRows.set(ev.player.id, row);
      }
      if (ev.type === "YELLOW_CARD") row.yellow++;
      else row.red++;
    }
  }

  const byCards = (a: { yellow: number; red: number }, b: { yellow: number; red: number }) =>
    b.red - a.red || b.yellow - a.yellow;

  return {
    teams: Array.from(teamRows.values()).sort(byCards),
    players: Array.from(playerRows.values()).sort(byCards).slice(0, 10),
  };
}
