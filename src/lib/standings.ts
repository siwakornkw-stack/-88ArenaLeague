import { prisma } from "@/lib/db";

export type StandingRow = {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: ("W" | "D" | "L")[];
};

type TeamLite = { id: string; name: string; abbr: string };
type MatchLite = { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number };

// matches must be FINISHED league-stage matches ordered by kickoffAt desc (drives form)
function buildTable(teams: TeamLite[], finishedMatches: MatchLite[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        teamName: t.name,
        teamAbbr: t.abbr,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        form: [],
      },
    ])
  );

  for (const match of finishedMatches) {
    const home = rows.get(match.homeTeamId);
    const away = rows.get(match.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won++;
      away.lost++;
      home.points += 3;
      if (home.form.length < 5) home.form.push("W");
      if (away.form.length < 5) away.form.push("L");
    } else if (match.homeScore < match.awayScore) {
      away.won++;
      home.lost++;
      away.points += 3;
      if (home.form.length < 5) home.form.push("L");
      if (away.form.length < 5) away.form.push("W");
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
      if (home.form.length < 5) home.form.push("D");
      if (away.form.length < 5) away.form.push("D");
    }
  }

  const standings = Array.from(rows.values()).map((r) => ({
    ...r,
    goalDiff: r.goalsFor - r.goalsAgainst,
  }));

  standings.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);

  return standings;
}

export async function computeStandings(leagueId: string): Promise<StandingRow[]> {
  const teams = await prisma.team.findMany({ where: { leagueId } });

  // playoff matches (SEMI_FINAL/FINAL) never count toward the league table
  const finishedMatches = await prisma.match.findMany({
    where: { leagueId, status: "FINISHED", stage: "LEAGUE" },
    orderBy: { kickoffAt: "desc" },
  });

  return buildTable(teams, finishedMatches);
}

// table as it stood before the given round (for position-movement arrows)
export async function computeStandingsUpTo(
  leagueId: string,
  beforeRound: number
): Promise<StandingRow[]> {
  const teams = await prisma.team.findMany({ where: { leagueId } });

  const finishedMatches = await prisma.match.findMany({
    where: { leagueId, status: "FINISHED", stage: "LEAGUE", round: { lt: beforeRound } },
    orderBy: { kickoffAt: "desc" },
  });

  return buildTable(teams, finishedMatches);
}
