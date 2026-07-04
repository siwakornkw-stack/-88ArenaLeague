import { prisma } from "@/lib/db";

export type LeagueCharts = {
  rounds: number[];
  goalsPerRound: number[];
  topTeams: { name: string; color: string; points: number[] }[];
};

export async function getLeagueCharts(leagueId: string): Promise<LeagueCharts | null> {
  const [teams, matches] = await Promise.all([
    prisma.team.findMany({ where: { leagueId } }),
    prisma.match.findMany({
      where: { leagueId, status: "FINISHED", stage: "LEAGUE" },
      orderBy: { round: "asc" },
    }),
  ]);
  if (matches.length === 0 || teams.length === 0) return null;

  const maxRound = Math.max(...matches.map((m) => m.round));
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const goalsPerRound = rounds.map((r) =>
    matches.filter((m) => m.round === r).reduce((sum, m) => sum + m.homeScore + m.awayScore, 0)
  );

  const running = new Map(teams.map((t) => [t.id, 0]));
  const progression = new Map(teams.map((t) => [t.id, [] as number[]]));
  for (const r of rounds) {
    for (const m of matches.filter((m) => m.round === r)) {
      if (m.homeScore > m.awayScore) {
        running.set(m.homeTeamId, running.get(m.homeTeamId)! + 3);
      } else if (m.homeScore < m.awayScore) {
        running.set(m.awayTeamId, running.get(m.awayTeamId)! + 3);
      } else {
        running.set(m.homeTeamId, running.get(m.homeTeamId)! + 1);
        running.set(m.awayTeamId, running.get(m.awayTeamId)! + 1);
      }
    }
    for (const t of teams) progression.get(t.id)!.push(running.get(t.id)!);
  }

  const topTeams = [...teams]
    .sort((a, b) => running.get(b.id)! - running.get(a.id)!)
    .slice(0, 5)
    .map((t) => ({ name: t.name, color: t.color, points: progression.get(t.id)! }));

  return { rounds, goalsPerRound, topTeams };
}
