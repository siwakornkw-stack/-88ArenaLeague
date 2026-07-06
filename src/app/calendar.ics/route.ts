import { prisma } from "@/lib/db";

function fmt(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

export async function GET() {
  const matches = await prisma.match.findMany({
    where: { league: { hidden: false, status: { not: "DRAFT" } } },
    include: { homeTeam: true, awayTeam: true, league: true },
    orderBy: { kickoffAt: "asc" },
  });

  const stamp = fmt(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//88ArenaLeague//TH",
    "X-WR-CALNAME:88ArenaLeague — ทุกลีก",
  ];
  for (const m of matches) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.id}@88arenaleague`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(m.kickoffAt)}`,
      `DTEND:${fmt(new Date(m.kickoffAt.getTime() + 2 * 3600000))}`,
      `SUMMARY:${esc(`[${m.league.name}] ${m.homeTeam.name} vs ${m.awayTeam.name}`)}`,
      ...(m.venue ? [`LOCATION:${esc(m.venue)}`] : []),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="88arenaleague.ics"',
    },
  });
}
