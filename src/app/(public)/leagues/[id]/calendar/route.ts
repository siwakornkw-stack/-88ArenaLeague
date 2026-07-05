import { prisma } from "@/lib/db";

function fmt(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string) {
  return s.replace(/([,;\\])/g, "\\$1");
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamId = new URL(req.url).searchParams.get("team");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) return new Response("Not found", { status: 404 });

  const filterTeam = teamId
    ? await prisma.team.findFirst({ where: { id: teamId, leagueId: id } })
    : null;

  const matches = await prisma.match.findMany({
    where: {
      leagueId: id,
      ...(teamId ? { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } : {}),
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//88ArenaLeague//TH",
    `X-WR-CALNAME:${esc(league.name)}`,
  ];
  const stamp = fmt(new Date());
  for (const m of matches) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.id}@88arenaleague`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(m.kickoffAt)}`,
      `DTEND:${fmt(new Date(m.kickoffAt.getTime() + 2 * 3600000))}`,
      `SUMMARY:${esc(`${filterTeam ? `[${filterTeam.abbr}] ` : ""}${m.homeTeam.name} vs ${m.awayTeam.name}`)}`,
      `DESCRIPTION:${esc(
        m.status === "FINISHED"
          ? `จบแล้ว ${m.homeScore}-${m.awayScore} · ${league.name}`
          : `นัดที่ ${m.round} · ${league.name}`
      )}`,
      ...(m.venue ? [`LOCATION:${esc(m.venue)}`] : []),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="league-${id}.ics"`,
    },
  });
}
