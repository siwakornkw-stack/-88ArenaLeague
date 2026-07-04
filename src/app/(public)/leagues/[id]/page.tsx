import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { getTopScorers } from "@/lib/topScorers";
import { MobileNav } from "@/components/mobile-nav";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "จัดตารางแล้ว",
  IN_PROGRESS: "กำลังแข่งขัน",
  FINISHED: "จบฤดูกาล",
};

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

export default async function PublicLeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "standings" } = await searchParams;

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { _count: { select: { players: true } } } } },
  });
  if (!league) notFound();

  const matches = await prisma.match.findMany({
    where: { leagueId: id },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
  });

  const matchesByRound = new Map<number, typeof matches>();
  for (const m of matches) {
    if (!matchesByRound.has(m.round)) matchesByRound.set(m.round, []);
    matchesByRound.get(m.round)!.push(m);
  }
  const totalRounds = matches.reduce((max, m) => Math.max(max, m.round), 0);
  const currentRound = matches.find((m) => m.status !== "FINISHED")?.round ?? totalRounds;
  const upcomingFixtures = matchesByRound.get(currentRound) ?? [];

  const standings = tab === "standings" ? await computeStandings(id) : [];
  const topScorers = tab === "standings" ? await getTopScorers(id, 5) : [];

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ตาราง", href: `/leagues/${id}?tab=standings`, active: tab === "standings" },
    { icon: "📅", label: "โปรแกรม", href: `/leagues/${id}?tab=fixtures`, active: tab === "fixtures" },
    { icon: "👥", label: "ทีม", href: `/leagues/${id}?tab=teams`, active: tab === "teams" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
          {league.name}
        </h1>
        <p className="mt-1 text-sm text-foreground/55">
          ฤดูกาล {league.seasonYear} · {league.teams.length} ทีม · {STATUS_LABEL[league.status]}
          {totalRounds > 0 && <> · นัดที่ {currentRound} จาก {totalRounds}</>}
        </p>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1">
        <div className="flex gap-2 border-b border-white/10 mb-6">
          <Link
            href={`/leagues/${id}?tab=standings`}
            className={`px-4 py-2 text-sm font-display font-semibold ${
              tab === "standings" ? "border-b-2 border-accent text-accent" : "text-foreground/60"
            }`}
          >
            ตารางคะแนน
          </Link>
          <Link
            href={`/leagues/${id}?tab=fixtures`}
            className={`px-4 py-2 text-sm font-display font-semibold ${
              tab === "fixtures" ? "border-b-2 border-accent text-accent" : "text-foreground/60"
            }`}
          >
            โปรแกรมแข่ง
          </Link>
          <Link
            href={`/leagues/${id}?tab=teams`}
            className={`px-4 py-2 text-sm font-display font-semibold ${
              tab === "teams" ? "border-b-2 border-accent text-accent" : "text-foreground/60"
            }`}
          >
            ทีม
          </Link>
        </div>

        {tab === "teams" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {league.teams.map((team) => (
              <div
                key={team.id}
                className="rounded-xl border border-white/10 bg-card p-4 flex items-center gap-3"
              >
                <span
                  className="w-10 h-10 rounded-full shrink-0 grid place-items-center font-display font-bold text-xs"
                  style={{ backgroundColor: team.color }}
                >
                  {team.abbr}
                </span>
                <div>
                  <div className="font-display font-semibold">{team.name}</div>
                  <div className="text-xs text-foreground/45">{team._count.players} นักเตะ</div>
                </div>
              </div>
            ))}
            {league.teams.length === 0 && (
              <p className="text-foreground/50 text-sm">ยังไม่มีทีมในลีกนี้</p>
            )}
          </div>
        ) : matches.length === 0 ? (
          <p className="text-foreground/50 text-sm">ยังไม่มีตารางแข่งสำหรับลีกนี้</p>
        ) : tab === "standings" ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6">
            <div className="rounded-xl border border-white/10 bg-card overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-foreground/45 text-xs">
                  <tr>
                    <th className="text-left py-3 px-4">#</th>
                    <th className="text-left">ทีม</th>
                    <th className="text-center">แข่ง</th>
                    <th className="text-center">ชนะ</th>
                    <th className="text-center">เสมอ</th>
                    <th className="text-center">แพ้</th>
                    <th className="text-center">+/-</th>
                    <th className="text-center">แต้ม</th>
                    <th className="text-center">ฟอร์ม</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => (
                    <tr
                      key={row.teamId}
                      className={`border-t border-white/5 ${
                        i < 2 ? "border-l-2 border-l-accent" : i >= standings.length - 2 ? "border-l-2 border-l-red-500" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-display font-bold">{i + 1}</td>
                      <td className="font-display font-semibold">{row.teamName}</td>
                      <td className="text-center text-foreground/70">{row.played}</td>
                      <td className="text-center text-foreground/70">{row.won}</td>
                      <td className="text-center text-foreground/70">{row.drawn}</td>
                      <td className="text-center text-foreground/70">{row.lost}</td>
                      <td className="text-center text-foreground/70">
                        {row.goalDiff >= 0 ? "+" : ""}
                        {row.goalDiff}
                      </td>
                      <td className="text-center font-display italic font-extrabold text-accent">
                        {row.points}
                      </td>
                      <td>
                        <div className="flex gap-1 justify-center py-1">
                          {row.form.map((f, j) => (
                            <span
                              key={j}
                              className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center ${FORM_LABEL[f].className}`}
                            >
                              {FORM_LABEL[f].t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-5 px-4 py-3 text-xs text-foreground/45 border-t border-white/5 min-w-[560px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-accent inline-block" /> เข้ารอบแชมเปียนส์
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> ตกชั้น
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {upcomingFixtures.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">โปรแกรมนัดที่ {currentRound}</h3>
                  <div className="flex flex-col gap-2">
                    {upcomingFixtures.map((fx) => (
                      <Link
                        key={fx.id}
                        href={`/matches/${fx.id}`}
                        className="grid grid-cols-[1fr_56px_1fr] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                      >
                        <span className="text-right">{fx.homeTeam.name}</span>
                        <span className="text-center rounded bg-accent text-black text-xs font-bold py-1">
                          {fx.status === "SCHEDULED"
                            ? fx.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                            : `${fx.homeScore}-${fx.awayScore}`}
                        </span>
                        <span>{fx.awayTeam.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {topScorers.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">ดาวซัลโว</h3>
                  <div className="flex flex-col gap-3">
                    {topScorers.map((sc, i) => (
                      <div key={sc.playerId} className="flex items-center gap-3 text-sm">
                        <span className="w-5 font-display italic font-extrabold text-foreground/50">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="font-display font-semibold">{sc.playerName}</div>
                          <div className="text-xs text-foreground/45">{sc.teamName}</div>
                        </div>
                        <span className="font-display italic font-extrabold text-accent text-lg">
                          {sc.goals}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(matchesByRound.entries()).map(([round, roundMatches]) => (
              <div key={round}>
                <h3 className="text-sm text-foreground/50 mb-2">นัดที่ {round}</h3>
                <div className="space-y-2">
                  {roundMatches.map((m) => (
                    <Link
                      key={m.id}
                      href={`/matches/${m.id}`}
                      className="flex items-center justify-between rounded-md bg-card border border-white/10 px-4 py-3 hover:border-accent/50"
                    >
                      <span>{m.homeTeam.name}</span>
                      <span className="text-foreground/50 text-sm">
                        {m.status === "SCHEDULED"
                          ? m.kickoffAt.toLocaleDateString("th-TH")
                          : `${m.homeScore} - ${m.awayScore}`}
                      </span>
                      <span>{m.awayTeam.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
