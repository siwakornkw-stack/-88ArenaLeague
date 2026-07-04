import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { getTopScorers, getTopAssists } from "@/lib/topScorers";
import { getDiscipline } from "@/lib/discipline";
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
  searchParams: Promise<{ tab?: string; round?: string }>;
}) {
  const { id } = await params;
  const { tab = "standings", round } = await searchParams;
  const roundFilter = Number(round) || null;

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

  const isFinished = league.status === "FINISHED";
  const standings = tab === "standings" || isFinished ? await computeStandings(id) : [];
  const topScorers = tab === "standings" || isFinished ? await getTopScorers(id, 5) : [];
  const discipline = tab === "discipline" ? await getDiscipline(id) : null;
  const topAssists = tab === "standings" ? await getTopAssists(id, 5) : [];
  const news =
    tab === "news"
      ? await prisma.leagueNews.findMany({ where: { leagueId: id }, orderBy: { createdAt: "desc" } })
      : [];
  const champion = isFinished ? (standings[0] ?? null) : null;
  const seasonTopScorer = isFinished ? (topScorers[0] ?? null) : null;

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ตาราง", href: `/leagues/${id}?tab=standings`, active: tab === "standings" },
    { icon: "📅", label: "โปรแกรม", href: `/leagues/${id}?tab=fixtures`, active: tab === "fixtures" },
    { icon: "👥", label: "ทีม", href: `/leagues/${id}?tab=teams`, active: tab === "teams" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
            {league.name}
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            ฤดูกาล {league.seasonYear} · {league.teams.length} ทีม · {STATUS_LABEL[league.status]}
            {totalRounds > 0 && <> · นัดที่ {currentRound} จาก {totalRounds}</>}
          </p>
          {league.description && (
            <p className="mt-2 text-sm text-foreground/60 max-w-xl whitespace-pre-line">
              {league.description}
            </p>
          )}
        </div>
        {matches.length > 0 && (
          <a
            href={`/leagues/${id}/calendar`}
            className="rounded-md border border-white/25 px-4 py-2 text-sm text-foreground/80 hover:border-accent/50 hover:text-accent"
          >
            📅 เพิ่มลงปฏิทิน
          </a>
        )}
      </div>

      {champion && (
        <div className="mx-6 md:mx-16 mt-6 rounded-2xl border border-accent/40 bg-gradient-to-r from-[#1a2e12] to-card p-5 flex flex-wrap items-center gap-6">
          <span className="text-4xl">🏆</span>
          <div>
            <div className="text-xs text-foreground/50">แชมป์ฤดูกาล {league.seasonYear}</div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {champion.teamName}
            </div>
            <div className="text-xs text-foreground/60">
              {champion.points} แต้ม · ชนะ {champion.won} จาก {champion.played} นัด
            </div>
          </div>
          {seasonTopScorer && (
            <div className="ml-auto text-right">
              <div className="text-xs text-foreground/50">ดาวซัลโวฤดูกาล</div>
              <div className="font-display font-bold">{seasonTopScorer.playerName}</div>
              <div className="text-xs text-accent">{seasonTopScorer.goals} ประตู</div>
            </div>
          )}
        </div>
      )}

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
          <Link
            href={`/leagues/${id}?tab=discipline`}
            className={`px-4 py-2 text-sm font-display font-semibold ${
              tab === "discipline" ? "border-b-2 border-accent text-accent" : "text-foreground/60"
            }`}
          >
            วินัย
          </Link>
          <Link
            href={`/leagues/${id}?tab=news`}
            className={`px-4 py-2 text-sm font-display font-semibold ${
              tab === "news" ? "border-b-2 border-accent text-accent" : "text-foreground/60"
            }`}
          >
            ข่าวสาร
          </Link>
        </div>

        {tab === "teams" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {league.teams.map((team) => (
              <Link
                key={team.id}
                href={`/leagues/${id}/teams/${team.id}`}
                className="rounded-xl border border-white/10 bg-card p-4 flex items-center gap-3 hover:border-accent/50"
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
              </Link>
            ))}
            {league.teams.length === 0 && (
              <p className="text-foreground/50 text-sm">ยังไม่มีทีมในลีกนี้</p>
            )}
          </div>
        ) : tab === "discipline" && discipline ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
            <div className="rounded-xl border border-white/10 bg-card overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <thead className="text-foreground/45 text-xs">
                  <tr>
                    <th className="text-left py-3 px-4">ทีม</th>
                    <th className="text-center">🟨 เหลือง</th>
                    <th className="text-center">🟥 แดง</th>
                  </tr>
                </thead>
                <tbody>
                  {discipline.teams.map((row) => (
                    <tr key={row.teamId} className="border-t border-white/5">
                      <td className="py-3 px-4 font-display font-semibold">{row.teamName}</td>
                      <td className="text-center text-yellow-400">{row.yellow}</td>
                      <td className="text-center text-red-400">{row.red}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h3 className="font-display font-bold mb-3">นักเตะโดนใบโทษสูงสุด</h3>
              <div className="flex flex-col gap-3">
                {discipline.players.map((p, i) => (
                  <div key={p.playerId} className="flex items-center gap-3 text-sm">
                    <span className="w-5 font-display italic font-extrabold text-foreground/50">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-display font-semibold">{p.playerName}</div>
                      <div className="text-xs text-foreground/45">{p.teamName}</div>
                    </div>
                    <span className="text-yellow-400">🟨 {p.yellow}</span>
                    <span className="text-red-400">🟥 {p.red}</span>
                  </div>
                ))}
                {discipline.players.length === 0 && (
                  <p className="text-foreground/50 text-sm">ยังไม่มีใบเหลือง-แดงในลีกนี้</p>
                )}
              </div>
            </div>
          </div>
        ) : tab === "news" ? (
          <div className="space-y-4 max-w-2xl">
            {news.map((n) => (
              <div key={n.id} className="rounded-xl border border-white/10 bg-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display font-bold">{n.title}</h3>
                  <span className="text-xs text-foreground/45 shrink-0">
                    {n.createdAt.toLocaleDateString("th-TH", { dateStyle: "medium" })}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground/70 whitespace-pre-line">{n.body}</p>
              </div>
            ))}
            {news.length === 0 && (
              <p className="text-foreground/50 text-sm">ยังไม่มีประกาศจากผู้จัดลีก</p>
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
                        i < league.promotedCount
                          ? "border-l-2 border-l-accent"
                          : league.relegatedCount > 0 && i >= standings.length - league.relegatedCount
                            ? "border-l-2 border-l-red-500"
                            : ""
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
                {league.promotedCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-accent inline-block" /> เข้ารอบแชมเปียนส์
                  </span>
                )}
                {league.relegatedCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> ตกชั้น
                  </span>
                )}
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

              {topAssists.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">ดาวแอสซิสต์</h3>
                  <div className="flex flex-col gap-3">
                    {topAssists.map((sc, i) => (
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
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="tab" value="fixtures" />
              <select
                name="round"
                defaultValue={roundFilter ?? ""}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">ทุกนัด</option>
                {Array.from(matchesByRound.keys()).map((r) => (
                  <option key={r} value={r}>
                    นัดที่ {r}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
                ดู
              </button>
            </form>
            {Array.from(matchesByRound.entries())
              .filter(([round]) => roundFilter === null || round === roundFilter)
              .map(([round, roundMatches]) => (
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
