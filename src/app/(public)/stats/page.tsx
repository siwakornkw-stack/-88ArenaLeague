import Link from "next/link";
import { prisma } from "@/lib/db";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "สถิติรวมทุกลีก",
  description: "ตัวเลขรวมทั้งระบบ 88ArenaLeague",
};

export default async function GlobalStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ leagueSort?: string; venueSort?: string; teamSort?: string }>;
}) {
  const { venueSort, teamSort } = await searchParams;
  const [finished, leagues, topScorers, yellowCount, redCount, scorerIds, cardsByLeague, ownGoalCount, penMissCount, teamRows] = await Promise.all([
    prisma.match.findMany({
      where: { status: "FINISHED", league: { hidden: false } },
      select: {
        id: true,
        homeScore: true,
        awayScore: true,
        leagueId: true,
        spectators: true,
        venue: true,
      },
    }),
    prisma.league.findMany({
      where: { status: { not: "DRAFT" }, hidden: false },
      select: { id: true, name: true },
    }),
    prisma.matchEvent.groupBy({
      by: ["playerId"],
      where: { type: "GOAL", playerId: { not: null }, match: { league: { hidden: false } } },
      _count: { playerId: true },
      orderBy: { _count: { playerId: "desc" } },
      take: 5,
    }),
    prisma.matchEvent.count({
      where: { type: "YELLOW_CARD", match: { league: { hidden: false } } },
    }),
    prisma.matchEvent.count({
      where: { type: "RED_CARD", match: { league: { hidden: false } } },
    }),
    prisma.matchEvent.findMany({
      where: { type: "GOAL", playerId: { not: null }, match: { league: { hidden: false } } },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
    prisma.matchEvent.groupBy({
      by: ["matchId"],
      where: {
        type: { in: ["YELLOW_CARD", "RED_CARD"] },
        match: { status: "FINISHED", league: { hidden: false } },
      },
      _count: { matchId: true },
    }),
    prisma.matchEvent.count({
      where: { type: "OWN_GOAL", match: { league: { hidden: false } } },
    }),
    prisma.matchEvent.count({
      where: { type: "PENALTY_MISSED", match: { league: { hidden: false } } },
    }),
    prisma.match.findMany({
      where: { status: "FINISHED", league: { hidden: false } },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { id: true, name: true, leagueId: true } },
        awayTeam: { select: { id: true, name: true, leagueId: true } },
      },
    }),
  ]);

  const biggestMarginId =
    finished.length > 0
      ? finished.reduce((a, b) =>
          Math.abs(b.homeScore - b.awayScore) > Math.abs(a.homeScore - a.awayScore) ? b : a
        )
      : null;

  const topCrowd =
    finished.filter((m) => (m.spectators ?? 0) > 0).length > 0
      ? finished
          .filter((m) => (m.spectators ?? 0) > 0)
          .reduce((a, b) => ((b.spectators ?? 0) > (a.spectators ?? 0) ? b : a))
      : null;

  const [topAssists, topMvps, highestMatch, biggestMargin, biggestCrowd] = await Promise.all([
    prisma.matchEvent.groupBy({
      by: ["relatedPlayerId"],
      where: {
        type: "GOAL",
        relatedPlayerId: { not: null },
        match: { league: { hidden: false } },
      },
      _count: { relatedPlayerId: true },
      orderBy: { _count: { relatedPlayerId: "desc" } },
      take: 5,
    }),
    prisma.match.groupBy({
      by: ["mvpPlayerId"],
      where: { mvpPlayerId: { not: null }, league: { hidden: false } },
      _count: { mvpPlayerId: true },
      orderBy: { _count: { mvpPlayerId: "desc" } },
      take: 5,
    }),
    finished.length > 0
      ? prisma.match.findUnique({
          where: {
            id: finished.reduce((a, b) =>
              b.homeScore + b.awayScore > a.homeScore + a.awayScore ? b : a
            ).id,
          },
          include: { homeTeam: true, awayTeam: true, league: true },
        })
      : Promise.resolve(null),
    biggestMarginId && Math.abs(biggestMarginId.homeScore - biggestMarginId.awayScore) > 0
      ? prisma.match.findUnique({
          where: { id: biggestMarginId.id },
          include: { homeTeam: true, awayTeam: true, league: true },
        })
      : Promise.resolve(null),
    topCrowd
      ? prisma.match.findUnique({
          where: { id: topCrowd.id },
          include: { homeTeam: true, awayTeam: true, league: true },
        })
      : Promise.resolve(null),
  ]);

  const totalGoals = finished.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const totalSpectators = finished.reduce((s, m) => s + (m.spectators ?? 0), 0);

  const homeWins = finished.filter((m) => m.homeScore > m.awayScore).length;
  const awayWins = finished.filter((m) => m.awayScore > m.homeScore).length;
  const draws = finished.filter((m) => m.homeScore === m.awayScore).length;
  const homeWinPct = finished.length > 0 ? Math.round((homeWins / finished.length) * 100) : 0;

  const cleanSheets = finished.reduce(
    (s, m) => s + (m.homeScore === 0 ? 1 : 0) + (m.awayScore === 0 ? 1 : 0),
    0
  );
  const cardsPerMatch =
    finished.length > 0 ? ((yellowCount + redCount) / finished.length).toFixed(2) : "0";

  const perLeague = leagues
    .map((lg) => {
      const ms = finished.filter((m) => m.leagueId === lg.id);
      const goals = ms.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
      return { ...lg, matches: ms.length, goals, avg: ms.length > 0 ? goals / ms.length : 0 };
    })
    .filter((l) => l.matches > 0)
    .sort((a, b) => b.avg - a.avg);

  const thrillers = finished.filter((m) => m.homeScore + m.awayScore >= 4).length;
  const thrillerPct = finished.length > 0 ? Math.round((thrillers / finished.length) * 100) : 0;

  const matchLeague = new Map(finished.map((m) => [m.id, m.leagueId]));
  const cardsPerLeagueTotals = new Map<string, number>();
  for (const c of cardsByLeague) {
    const lid = matchLeague.get(c.matchId);
    if (!lid) continue;
    cardsPerLeagueTotals.set(lid, (cardsPerLeagueTotals.get(lid) ?? 0) + c._count.matchId);
  }
  const disciplineBoard = leagues
    .map((lg) => {
      const ms = finished.filter((m) => m.leagueId === lg.id).length;
      const cards = cardsPerLeagueTotals.get(lg.id) ?? 0;
      return { id: lg.id, name: lg.name, matches: ms, cards, per: ms > 0 ? cards / ms : 0 };
    })
    .filter((l) => l.matches > 0)
    .sort((a, b) => b.per - a.per);

  const drawBoard = leagues
    .map((lg) => {
      const ms = finished.filter((m) => m.leagueId === lg.id);
      const drawn = ms.filter((m) => m.homeScore === m.awayScore).length;
      return {
        id: lg.id,
        name: lg.name,
        matches: ms.length,
        draws: drawn,
        pct: ms.length > 0 ? (drawn / ms.length) * 100 : 0,
      };
    })
    .filter((l) => l.matches > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  const teamGoals = new Map<
    string,
    { name: string; leagueId: string; scored: number; conceded: number; matches: number }
  >();
  for (const m of teamRows) {
    const h = teamGoals.get(m.homeTeamId) ?? {
      name: m.homeTeam.name,
      leagueId: m.homeTeam.leagueId,
      scored: 0,
      conceded: 0,
      matches: 0,
    };
    h.scored += m.homeScore;
    h.conceded += m.awayScore;
    h.matches += 1;
    teamGoals.set(m.homeTeamId, h);
    const a = teamGoals.get(m.awayTeamId) ?? {
      name: m.awayTeam.name,
      leagueId: m.awayTeam.leagueId,
      scored: 0,
      conceded: 0,
      matches: 0,
    };
    a.scored += m.awayScore;
    a.conceded += m.homeScore;
    a.matches += 1;
    teamGoals.set(m.awayTeamId, a);
  }
  const teamSortByAvg = teamSort === "avg";
  const prolificTeams = Array.from(teamGoals.entries())
    .map(([id, t]) => ({ id, ...t, avg: t.matches > 0 ? t.scored / t.matches : 0 }))
    .sort((a, b) => (teamSortByAvg ? b.avg - a.avg : b.scored - a.scored))
    .slice(0, 8);

  const venueTotals = new Map<string, { matches: number; crowd: number }>();
  for (const m of finished) {
    const v = m.venue?.trim();
    if (!v) continue;
    const cur = venueTotals.get(v) ?? { matches: 0, crowd: 0 };
    cur.matches += 1;
    cur.crowd += m.spectators ?? 0;
    venueTotals.set(v, cur);
  }
  const venueSortByCrowd = venueSort === "crowd";
  const venueBoard = Array.from(venueTotals.entries())
    .map(([name, v]) => ({ name, matches: v.matches, crowd: v.crowd }))
    .sort((a, b) => (venueSortByCrowd ? b.crowd - a.crowd : b.matches - a.matches))
    .slice(0, 8);

  const attendanceLeague = leagues
    .map((lg) => {
      const ms = finished.filter((m) => m.leagueId === lg.id && (m.spectators ?? 0) > 0);
      const crowd = ms.reduce((s, m) => s + (m.spectators ?? 0), 0);
      return { id: lg.id, name: lg.name, matches: ms.length, crowd, avg: ms.length > 0 ? crowd / ms.length : 0 };
    })
    .filter((l) => l.matches > 0)
    .sort((a, b) => b.avg - a.avg)[0];

  const topScorerGoals = topScorers[0]?._count.playerId ?? 0;
  const scorerMilestone =
    topScorerGoals >= 20
      ? { label: "ชมรม 20+ ประตู", cls: "border-accent/60 bg-accent/15 text-accent" }
      : topScorerGoals >= 10
        ? { label: "ชมรม 10+ ประตู", cls: "border-yellow-400/40 bg-yellow-400/10 text-yellow-300" }
        : null;

  const scorerPlayers = await prisma.player.findMany({
    where: {
      id: {
        in: [
          ...topScorers.map((g) => g.playerId!),
          ...topAssists.map((g) => g.relatedPlayerId!),
          ...topMvps.map((g) => g.mvpPlayerId!),
        ],
      },
    },
    include: { team: { include: { league: true } } },
  });
  const byId = new Map(scorerPlayers.map((p) => [p.id, p]));

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "📊", label: "สถิติรวม", href: "/stats", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <div className="glow-blob w-80 h-80 -top-24 right-10" />
        <h1 className="font-display italic font-black text-3xl md:text-5xl text-foreground">
          สถิติรวม<span className="text-accent">ทุกลีก</span>
        </h1>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-8">
        <div className="flex flex-wrap gap-8 rounded-xl border border-white/10 bg-card p-5 text-sm">
          <div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {finished.length}
            </div>
            <div className="text-xs text-foreground/55">แมตช์ที่จบแล้ว</div>
          </div>
          <div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {totalGoals}
            </div>
            <div className="text-xs text-foreground/55">ประตูรวมทั้งระบบ</div>
          </div>
          <div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {finished.length > 0 ? (totalGoals / finished.length).toFixed(1) : "0"}
            </div>
            <div className="text-xs text-foreground/55">ประตูเฉลี่ย/นัด</div>
          </div>
          {totalSpectators > 0 && (
            <div>
              <div className="font-display italic font-extrabold text-2xl text-accent">
                {totalSpectators.toLocaleString()}
              </div>
              <div className="text-xs text-foreground/55">ผู้ชมสะสม</div>
            </div>
          )}
          <div>
            <div className="font-display italic font-extrabold text-2xl text-yellow-400">
              {yellowCount}
            </div>
            <div className="text-xs text-foreground/55">ใบเหลืองทั้งระบบ</div>
          </div>
          <div>
            <div className="font-display italic font-extrabold text-2xl text-red-400">
              {redCount}
            </div>
            <div className="text-xs text-foreground/55">ใบแดงทั้งระบบ</div>
          </div>
          <div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {scorerIds.length}
            </div>
            <div className="text-xs text-foreground/55">นักเตะที่ยิงได้อย่างน้อย 1 ประตู</div>
          </div>
          <div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {cardsPerMatch}
            </div>
            <div className="text-xs text-foreground/55">ใบเฉลี่ย/นัด</div>
          </div>
          <div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {cleanSheets}
            </div>
            <div className="text-xs text-foreground/55">คลีนชีตทั้งระบบ</div>
          </div>
          {ownGoalCount > 0 && (
            <div>
              <div className="font-display italic font-extrabold text-2xl text-red-400">
                {ownGoalCount}
              </div>
              <div className="text-xs text-foreground/55">ทำเข้าประตูตัวเอง</div>
            </div>
          )}
          {penMissCount > 0 && (
            <div>
              <div className="font-display italic font-extrabold text-2xl text-foreground/70">
                {penMissCount}
              </div>
              <div className="text-xs text-foreground/55">ยิงจุดโทษพลาด</div>
            </div>
          )}
          <div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {thrillers}
            </div>
            <div className="text-xs text-foreground/55">
              แมตช์ยิงกันมันส์ 4+ ประตู ({thrillerPct}%)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="rounded-xl border border-white/10 bg-card p-5">
            <h2 className="font-display font-bold mb-3">ลีกที่บู๊สุด (ประตูเฉลี่ย/นัด)</h2>
            <div className="space-y-2 text-sm">
              {perLeague.map((l, i) => (
                <Link
                  key={l.id}
                  href={`/leagues/${l.id}`}
                  className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2 hover:bg-white/10"
                >
                  <span className="w-5 font-display font-bold text-foreground/50">{i + 1}</span>
                  <span className="flex-1 truncate">{l.name}</span>
                  <span className="text-xs text-foreground/45">{l.goals} ประตู</span>
                  <span className="font-display font-bold text-accent">{l.avg.toFixed(1)}</span>
                </Link>
              ))}
            </div>
          </div>

          {disciplineBoard.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h2 className="font-display font-bold mb-3">ลีกที่เดือดที่สุด (ใบเฉลี่ย/นัด)</h2>
              <div className="space-y-2 text-sm">
                {disciplineBoard.map((l, i) => (
                  <Link
                    key={l.id}
                    href={`/leagues/${l.id}`}
                    className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2 hover:bg-white/10"
                  >
                    <span className="w-5 font-display font-bold text-foreground/50">{i + 1}</span>
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="text-xs text-foreground/45">{l.cards} ใบ</span>
                    <span className="font-display font-bold text-yellow-400">
                      {l.per.toFixed(2)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {prolificTeams.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display font-bold">ทีมยิงประตูเยอะสุดทั้งระบบ</h2>
                <form method="get" className="flex gap-1 text-xs">
                  <button
                    name="teamSort"
                    value="total"
                    className={`rounded-md px-2 py-1 ${
                      !teamSortByAvg ? "bg-accent text-black" : "bg-white/5 text-foreground/60"
                    }`}
                  >
                    ประตูรวม
                  </button>
                  <button
                    name="teamSort"
                    value="avg"
                    className={`rounded-md px-2 py-1 ${
                      teamSortByAvg ? "bg-accent text-black" : "bg-white/5 text-foreground/60"
                    }`}
                  >
                    เฉลี่ย/นัด
                  </button>
                </form>
              </div>
              <div className="space-y-2 text-sm">
                {prolificTeams.map((t, i) => (
                  <Link
                    key={t.id}
                    href={`/leagues/${t.leagueId}/teams/${t.id}`}
                    className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2 hover:bg-white/10"
                  >
                    <span className="w-5 font-display font-bold text-foreground/50">{i + 1}</span>
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-xs text-foreground/45">
                      {teamSortByAvg ? `${t.scored} ประตู` : `${t.avg.toFixed(1)}/นัด`}
                    </span>
                    <span className="font-display font-bold text-accent">
                      {teamSortByAvg ? t.avg.toFixed(1) : t.scored}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {drawBoard.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h2 className="font-display font-bold mb-3">ลีกที่เสมอบ่อยสุด (% เสมอ)</h2>
              <div className="space-y-2 text-sm">
                {drawBoard.map((l, i) => (
                  <Link
                    key={l.id}
                    href={`/leagues/${l.id}`}
                    className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2 hover:bg-white/10"
                  >
                    <span className="w-5 font-display font-bold text-foreground/50">{i + 1}</span>
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="text-xs text-foreground/45">
                      {l.draws}/{l.matches} นัด
                    </span>
                    <span className="font-display font-bold text-accent">
                      {Math.round(l.pct)}%
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {finished.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h2 className="font-display font-bold mb-3">ความได้เปรียบเจ้าบ้าน</h2>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="bg-accent"
                  style={{ width: `${(homeWins / finished.length) * 100}%` }}
                />
                <div
                  className="bg-white/25"
                  style={{ width: `${(draws / finished.length) * 100}%` }}
                />
                <div
                  className="bg-white/10"
                  style={{ width: `${(awayWins / finished.length) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <div>
                  <div className="font-display italic font-extrabold text-accent">{homeWins}</div>
                  <div className="text-xs text-foreground/55">เจ้าบ้านชนะ</div>
                </div>
                <div className="text-center">
                  <div className="font-display italic font-extrabold text-foreground/70">
                    {draws}
                  </div>
                  <div className="text-xs text-foreground/55">เสมอ</div>
                </div>
                <div className="text-right">
                  <div className="font-display italic font-extrabold text-foreground/70">
                    {awayWins}
                  </div>
                  <div className="text-xs text-foreground/55">ทีมเยือนชนะ</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-foreground/45">
                เจ้าบ้านคว้าชัย {homeWinPct}% ของแมตช์ที่จบแล้ว
              </div>
            </div>
          )}

          {highestMatch && (
            <Link
              href={`/matches/${highestMatch.id}`}
              className="rounded-xl border border-accent/30 bg-card p-5 hover:border-accent/60"
            >
              <div className="text-xs text-foreground/50 mb-1">🎇 แมตช์ประตูเยอะสุดในระบบ</div>
              <div className="font-display font-bold">
                {highestMatch.homeTeam.name} {highestMatch.homeScore}-{highestMatch.awayScore}{" "}
                {highestMatch.awayTeam.name}
              </div>
              <div className="text-xs text-foreground/45 mt-1">
                {highestMatch.league.name} ·{" "}
                {highestMatch.homeScore + highestMatch.awayScore} ประตู
              </div>
            </Link>
          )}

          {biggestMargin && (
            <Link
              href={`/matches/${biggestMargin.id}`}
              className="rounded-xl border border-accent/30 bg-card p-5 hover:border-accent/60"
            >
              <div className="text-xs text-foreground/50 mb-1">💥 ชนะขาดที่สุดในระบบ</div>
              <div className="font-display font-bold">
                {biggestMargin.homeTeam.name} {biggestMargin.homeScore}-{biggestMargin.awayScore}{" "}
                {biggestMargin.awayTeam.name}
              </div>
              <div className="text-xs text-foreground/45 mt-1">
                {biggestMargin.league.name} · ห่าง{" "}
                {Math.abs(biggestMargin.homeScore - biggestMargin.awayScore)} ประตู
              </div>
            </Link>
          )}

          {biggestCrowd && (biggestCrowd.spectators ?? 0) > 0 && (
            <Link
              href={`/matches/${biggestCrowd.id}`}
              className="rounded-xl border border-accent/30 bg-card p-5 hover:border-accent/60"
            >
              <div className="text-xs text-foreground/50 mb-1">🎟️ แมตช์คนดูเยอะสุดในระบบ</div>
              <div className="font-display font-bold">
                {biggestCrowd.homeTeam.name} {biggestCrowd.homeScore}-{biggestCrowd.awayScore}{" "}
                {biggestCrowd.awayTeam.name}
              </div>
              <div className="text-xs text-foreground/45 mt-1">
                {biggestCrowd.league.name} ·{" "}
                {(biggestCrowd.spectators ?? 0).toLocaleString()} คน
              </div>
            </Link>
          )}

          {attendanceLeague && (
            <Link
              href={`/leagues/${attendanceLeague.id}`}
              className="rounded-xl border border-accent/30 bg-card p-5 hover:border-accent/60"
            >
              <div className="text-xs text-foreground/50 mb-1">📣 ลีกคนดูเยอะสุด (เฉลี่ย/นัด)</div>
              <div className="font-display font-bold">{attendanceLeague.name}</div>
              <div className="text-xs text-foreground/45 mt-1">
                {Math.round(attendanceLeague.avg).toLocaleString()} คน/นัด ·{" "}
                {attendanceLeague.crowd.toLocaleString()} คนรวม ({attendanceLeague.matches} นัด)
              </div>
            </Link>
          )}

          {venueBoard.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display font-bold">สนามที่จัดบ่อยสุดในระบบ</h2>
                <form method="get" className="flex gap-1 text-xs">
                  <button
                    name="venueSort"
                    value="matches"
                    className={`rounded-md px-2 py-1 ${
                      !venueSortByCrowd ? "bg-accent text-black" : "bg-white/5 text-foreground/60"
                    }`}
                  >
                    ตามจำนวนนัด
                  </button>
                  <button
                    name="venueSort"
                    value="crowd"
                    className={`rounded-md px-2 py-1 ${
                      venueSortByCrowd ? "bg-accent text-black" : "bg-white/5 text-foreground/60"
                    }`}
                  >
                    ตามผู้ชม
                  </button>
                </form>
              </div>
              <div className="space-y-2 text-sm">
                {venueBoard.map((v, i) => (
                  <div
                    key={v.name}
                    className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2"
                  >
                    <span className="w-5 font-display font-bold text-foreground/50">{i + 1}</span>
                    <span className="flex-1 truncate">{v.name}</span>
                    <span className="text-xs text-foreground/45">{v.matches} นัด</span>
                    <span className="font-display font-bold text-accent">
                      {v.crowd > 0 ? v.crowd.toLocaleString() : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-card p-5">
            <h2 className="font-display font-bold mb-3">แอสซิสต์สูงสุดข้ามลีก</h2>
            <div className="space-y-3 text-sm">
              {topAssists.map((g, i) => {
                const p = byId.get(g.relatedPlayerId!);
                if (!p) return null;
                return (
                  <Link
                    key={g.relatedPlayerId}
                    href={`/leagues/${p.team.leagueId}/players/${p.id}`}
                    className="flex items-center gap-3 hover:text-accent"
                  >
                    <span className="w-5 font-display italic font-extrabold text-foreground/50">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-display font-semibold">{p.name}</div>
                      <div className="text-xs text-foreground/45">
                        {p.team.name} · {p.team.league.name}
                      </div>
                    </div>
                    <span className="font-display italic font-extrabold text-accent text-lg">
                      {g._count.relatedPlayerId}
                    </span>
                  </Link>
                );
              })}
              {topAssists.length === 0 && (
                <p className="text-foreground/50">ยังไม่มีข้อมูลแอสซิสต์</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-card p-5">
            <h2 className="font-display font-bold mb-3">MVP สูงสุดข้ามลีก</h2>
            <div className="space-y-3 text-sm">
              {topMvps.map((g, i) => {
                const p = byId.get(g.mvpPlayerId!);
                if (!p) return null;
                return (
                  <Link
                    key={g.mvpPlayerId}
                    href={`/leagues/${p.team.leagueId}/players/${p.id}`}
                    className="flex items-center gap-3 hover:text-accent"
                  >
                    <span className="w-5 font-display italic font-extrabold text-foreground/50">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-display font-semibold">{p.name}</div>
                      <div className="text-xs text-foreground/45">
                        {p.team.name} · {p.team.league.name}
                      </div>
                    </div>
                    <span className="font-display italic font-extrabold text-accent text-lg">
                      {g._count.mvpPlayerId}
                    </span>
                  </Link>
                );
              })}
              {topMvps.length === 0 && <p className="text-foreground/50">ยังไม่มีข้อมูล MVP</p>}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display font-bold">ดาวซัลโวข้ามทุกลีก</h2>
              {scorerMilestone && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-display font-bold ${scorerMilestone.cls}`}
                >
                  {scorerMilestone.label}
                </span>
              )}
            </div>
            <div className="space-y-3 text-sm">
              {topScorers.map((g, i) => {
                const p = byId.get(g.playerId!);
                if (!p) return null;
                return (
                  <Link
                    key={g.playerId}
                    href={`/leagues/${p.team.leagueId}/players/${p.id}`}
                    className="flex items-center gap-3 hover:text-accent"
                  >
                    <span className="w-5 font-display italic font-extrabold text-foreground/50">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-display font-semibold">{p.name}</div>
                      <div className="text-xs text-foreground/45">
                        {p.team.name} · {p.team.league.name}
                      </div>
                    </div>
                    <span className="font-display italic font-extrabold text-accent text-lg">
                      {g._count.playerId}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
