import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { players: true } } },
  });
  if (!league) return new Response("Not found", { status: 404 });

  const [standings, matches] = await Promise.all([
    computeStandings(id),
    prisma.match.findMany({
      where: { leagueId: id },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
    }),
  ]);

  return Response.json({
    league: {
      id: league.id,
      name: league.name,
      seasonYear: league.seasonYear,
      status: league.status,
      teams: league.teams.map((t) => ({
        id: t.id,
        name: t.name,
        abbr: t.abbr,
        players: t.players.map((p) => ({
          id: p.id,
          name: p.name,
          number: p.number,
          position: p.position,
          status: p.status,
        })),
      })),
    },
    standings,
    matches: matches.map((m) => ({
      id: m.id,
      round: m.round,
      stage: m.stage,
      status: m.status,
      kickoffAt: m.kickoffAt,
      venue: m.venue,
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    })),
  });
}
