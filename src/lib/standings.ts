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

  return applyHeadToHead(standings, finishedMatches);
}

// teams level on points are re-ordered by their mutual results (points, then GD in
// those games), falling back to overall GD/GF
function applyHeadToHead(standings: StandingRow[], matches: MatchLite[]): StandingRow[] {
  const out: StandingRow[] = [];
  let i = 0;
  while (i < standings.length) {
    let j = i;
    while (j < standings.length && standings[j].points === standings[i].points) j++;
    const group = standings.slice(i, j);

    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.teamId));
      const mini = new Map(group.map((g) => [g.teamId, { pts: 0, gd: 0 }]));
      for (const m of matches) {
        if (!ids.has(m.homeTeamId) || !ids.has(m.awayTeamId)) continue;
        const home = mini.get(m.homeTeamId)!;
        const away = mini.get(m.awayTeamId)!;
        home.gd += m.homeScore - m.awayScore;
        away.gd += m.awayScore - m.homeScore;
        if (m.homeScore > m.awayScore) home.pts += 3;
        else if (m.homeScore < m.awayScore) away.pts += 3;
        else {
          home.pts++;
          away.pts++;
        }
      }
      group.sort(
        (a, b) =>
          mini.get(b.teamId)!.pts - mini.get(a.teamId)!.pts ||
          mini.get(b.teamId)!.gd - mini.get(a.teamId)!.gd ||
          b.goalDiff - a.goalDiff ||
          b.goalsFor - a.goalsFor
      );
    }

    out.push(...group);
    i = j;
  }
  return out;
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

// home-only or away-only table: each team is credited only for matches on that side
export async function computeHomeAwayStandings(
  leagueId: string,
  side: "HOME" | "AWAY"
): Promise<StandingRow[]> {
  const teams = await prisma.team.findMany({ where: { leagueId } });
  const matches = await prisma.match.findMany({
    where: { leagueId, status: "FINISHED", stage: "LEAGUE" },
    orderBy: { kickoffAt: "desc" },
  });

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

  for (const m of matches) {
    const teamId = side === "HOME" ? m.homeTeamId : m.awayTeamId;
    const row = rows.get(teamId);
    if (!row) continue;
    const gf = side === "HOME" ? m.homeScore : m.awayScore;
    const ga = side === "HOME" ? m.awayScore : m.homeScore;

    row.played++;
    row.goalsFor += gf;
    row.goalsAgainst += ga;
    let result: "W" | "D" | "L";
    if (gf > ga) {
      row.won++;
      row.points += 3;
      result = "W";
    } else if (gf < ga) {
      row.lost++;
      result = "L";
    } else {
      row.drawn++;
      row.points++;
      result = "D";
    }
    if (row.form.length < 5) row.form.push(result);
  }

  const standings = Array.from(rows.values()).map((r) => ({
    ...r,
    goalDiff: r.goalsFor - r.goalsAgainst,
  }));
  standings.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);
  return standings;
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
