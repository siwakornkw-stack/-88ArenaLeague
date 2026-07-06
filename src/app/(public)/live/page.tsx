import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { computeStandings } from "@/lib/standings";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "แมตช์สดตอนนี้",
  description: "ทุกแมตช์ที่กำลังแข่งขันสดบน 88ArenaLeague",
};

export default async function LivePage() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [live, upcoming, todayPlayed] = await Promise.all([
    prisma.match.findMany({
      where: { status: "LIVE" },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
        events: {
          where: { type: { in: ["KICK_OFF", "GOAL", "OWN_GOAL"] } },
          include: { player: true },
        },
      },
      orderBy: { kickoffAt: "asc" },
    }),
    prisma.match.findMany({
      where: { status: "SCHEDULED", kickoffAt: { gte: new Date() } },
      include: { homeTeam: true, awayTeam: true, league: true },
      orderBy: { kickoffAt: "asc" },
      take: 6,
    }),
    prisma.match.findMany({
      where: {
        status: { not: "SCHEDULED" },
        kickoffAt: { gte: dayStart, lt: dayEnd },
      },
      select: { homeScore: true, awayScore: true },
    }),
  ]);

  const todayGoals = todayPlayed.reduce((s, m) => s + m.homeScore + m.awayScore, 0);

  // Feature: per-league upcoming counts across ALL future scheduled matches (not just the 6 shown)
  const upcomingByLeagueRaw = await prisma.match.groupBy({
    by: ["leagueId"],
    where: { status: "SCHEDULED", kickoffAt: { gte: new Date() } },
    _count: { _all: true },
    _min: { kickoffAt: true },
  });
  const upcomingLeagueNames = await prisma.league.findMany({
    where: { id: { in: upcomingByLeagueRaw.map((g) => g.leagueId) } },
    select: { id: true, name: true },
  });
  const upcomingLeagueNameById = new Map(upcomingLeagueNames.map((l) => [l.id, l.name]));
  const upcomingByLeague = upcomingByLeagueRaw
    .map((g) => ({
      leagueId: g.leagueId,
      name: upcomingLeagueNameById.get(g.leagueId) ?? "",
      count: g._count._all,
      nextKickoff: g._min.kickoffAt,
    }))
    .sort((a, b) => b.count - a.count || (a.nextKickoff?.getTime() ?? 0) - (b.nextKickoff?.getTime() ?? 0));

  const todayFinished = await prisma.match.findMany({
    where: { status: "FINISHED", kickoffAt: { gte: dayStart, lt: dayEnd } },
    include: { homeTeam: true, awayTeam: true, league: true },
    orderBy: { kickoffAt: "desc" },
    take: 10,
  });

  // Feature: goals scored across the whole platform in the last 60 minutes
  // (time-windowed count, distinct from the "8 most recent" ticker which has no window)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const goalsLastHour = await prisma.matchEvent.count({
    where: { type: { in: ["GOAL", "OWN_GOAL"] }, createdAt: { gte: oneHourAgo } },
  });

  const liveByLeague = new Map<string, typeof live>();
  for (const m of live) {
    if (!liveByLeague.has(m.league.name)) liveByLeague.set(m.league.name, []);
    liveByLeague.get(m.league.name)!.push(m);
  }

  // Feature: closest title race among leagues with a live match right now —
  // smallest points gap between 1st and 2nd (LEAGUE stage, via computeStandings)
  const liveLeagues = [
    ...new Map(live.map((m) => [m.leagueId, m.league.name])).entries(),
  ];
  const liveStandings = await Promise.all(
    liveLeagues.map(async ([leagueId, name]) => {
      const table = await computeStandings(leagueId);
      const contenders = table.filter((r) => r.played > 0);
      if (contenders.length < 2) return null;
      return {
        leagueId,
        name,
        leader: contenders[0],
        chaser: contenders[1],
        gap: contenders[0].points - contenders[1].points,
      };
    }),
  );
  const titleRace = liveStandings
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.gap - b.gap)[0] ?? null;

  // Feature 1: live goals now + hottest live match (highest combined score, tie-broken by latest minute)
  const liveGoalsNow = live.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const hottestLive = live.reduce<(typeof live)[number] | null>((best, m) => {
    if (!best) return m;
    const bestGoals = best.homeScore + best.awayScore;
    const mGoals = m.homeScore + m.awayScore;
    if (mGoals > bestGoals) return m;
    if (mGoals === bestGoals && bestGoals > 0) {
      const bestKick = best.events.find((e) => e.type === "KICK_OFF");
      const mKick = m.events.find((e) => e.type === "KICK_OFF");
      const bestMin = bestKick ? computeLiveMinute(bestKick.createdAt) : 0;
      const mMin = mKick ? computeLiveMinute(mKick.createdAt) : 0;
      return mMin > bestMin ? m : best;
    }
    return best;
  }, null);

  // Feature: longest-running live match — highest computed live minute across live games
  const longestLive = live.reduce<
    { match: (typeof live)[number]; minute: number } | null
  >((best, m) => {
    const k = m.events.find((e) => e.type === "KICK_OFF");
    const minute = k ? computeLiveMinute(k.createdAt) : 0;
    if (!best || minute > best.minute) return { match: m, minute };
    return best;
  }, null);

  // Feature: live goal ticker — most recent goals across all live matches (scorer + minute)
  const liveGoals = live
    .flatMap((m) =>
      m.events
        .filter((e) => e.type === "GOAL" || e.type === "OWN_GOAL")
        .map((e) => ({
          matchId: m.id,
          minute: e.minute,
          createdAt: e.createdAt,
          isOwnGoal: e.type === "OWN_GOAL",
          scorer: e.player?.name ?? null,
          // OWN_GOAL counts for the opposite side of the player who scored it
          scoringTeam:
            (e.side === "HOME") === (e.type === "OWN_GOAL")
              ? m.awayTeam.name
              : m.homeTeam.name,
        })),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  // Feature 2: today's finished-match summary (played / draws / biggest win margin)
  const todayDraws = todayFinished.filter((m) => m.homeScore === m.awayScore).length;
  const biggestWin = todayFinished.reduce<(typeof todayFinished)[number] | null>((best, m) => {
    const margin = Math.abs(m.homeScore - m.awayScore);
    if (margin === 0) return best;
    if (!best) return m;
    return margin > Math.abs(best.homeScore - best.awayScore) ? m : best;
  }, null);

  // Feature: countdown to the next scheduled kickoff (derived from already-fetched upcoming list)
  const now = Date.now();
  const nextMatch = upcoming[0] ?? null;
  const minutesUntil = (d: Date) => Math.max(0, Math.round((d.getTime() - now) / 60000));
  const formatCountdown = (mins: number) =>
    mins >= 60 ? `${Math.floor(mins / 60)} ชม. ${mins % 60} น.` : `${mins} น.`;

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🔴", label: "สด", href: "/live", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      {live.length > 0 && <meta httpEquiv="refresh" content="60" />}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <div className="glow-blob w-80 h-80 -top-24 right-10" />
        <h1 className="font-display italic font-black text-3xl md:text-5xl text-foreground">
          กำลังแข่ง<span className="text-accent">สด</span>
        </h1>
        <p className="mt-1 text-sm text-foreground/55">
          {live.length > 0 ? `${live.length} แมตช์กำลังแข่งขัน · รีเฟรชอัตโนมัติทุก 60 วิ` : "ยังไม่มีแมตช์สดตอนนี้"}
          {todayGoals > 0 && <span className="text-accent"> · ⚽ {todayGoals} ประตูวันนี้</span>}
        </p>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-10">
        {live.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl">
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="text-xs text-foreground/45">ประตูในเกมสดตอนนี้</div>
              <div className="font-display italic font-black text-3xl text-accent mt-1">{liveGoalsNow}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="text-xs text-foreground/45">แมตช์สดทั้งหมด</div>
              <div className="font-display italic font-black text-3xl text-foreground mt-1">{live.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="text-xs text-foreground/45">⚡ ประตูใน 60 นาทีล่าสุด</div>
              <div className="font-display italic font-black text-3xl text-accent mt-1">{goalsLastHour}</div>
            </div>
            {hottestLive && hottestLive.homeScore + hottestLive.awayScore > 0 && (
              <Link
                href={`/matches/${hottestLive.id}`}
                className="rounded-xl border border-red-500/30 bg-card p-4 hover:border-red-400/60"
              >
                <div className="text-xs text-red-400">🔥 คู่เดือดที่สุด</div>
                <div className="text-sm mt-1 truncate">
                  {hottestLive.homeTeam.name} <span className="text-accent font-bold">{hottestLive.homeScore}-{hottestLive.awayScore}</span> {hottestLive.awayTeam.name}
                </div>
              </Link>
            )}
            {longestLive && longestLive.minute > 0 && (
              <Link
                href={`/matches/${longestLive.match.id}`}
                className="rounded-xl border border-white/10 bg-card p-4 hover:border-accent/50"
              >
                <div className="text-xs text-foreground/45">⏱️ เตะมานานสุด</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="font-display italic font-black text-2xl text-foreground">{longestLive.minute}&apos;</span>
                  <span className="text-sm truncate text-foreground/70">
                    {longestLive.match.homeTeam.name} พบ {longestLive.match.awayTeam.name}
                  </span>
                </div>
              </Link>
            )}
          </div>
        )}

        {titleRace && (
          <Link
            href={`/leagues/${titleRace.leagueId}`}
            className="block rounded-xl border border-accent/30 bg-card p-4 max-w-2xl hover:border-accent/60"
          >
            <div className="text-xs text-foreground/45">
              🏆 ลุ้นแชมป์สูสีที่สุด (ในลีกที่แข่งสด) · {titleRace.name}
            </div>
            <div className="flex items-center justify-between gap-3 mt-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{titleRace.leader.teamName}</span>
                <span className="font-display font-black text-accent shrink-0">{titleRace.leader.points}</span>
              </div>
              <span className="text-xs text-foreground/40 shrink-0">
                {titleRace.gap === 0 ? "เท่ากันแต้ม!" : `นำอยู่ ${titleRace.gap} แต้ม`}
              </span>
              <div className="flex items-center gap-2 min-w-0 justify-end">
                <span className="font-display font-black text-foreground shrink-0">{titleRace.chaser.points}</span>
                <span className="text-sm truncate">{titleRace.chaser.teamName}</span>
              </div>
            </div>
          </Link>
        )}

        {liveGoals.length > 0 && (
          <div className="rounded-xl border border-accent/20 bg-card p-4 max-w-2xl">
            <div className="text-xs text-foreground/45 mb-3">⚡ ประตูล่าสุดในเกมสด</div>
            <div className="flex flex-col gap-2">
              {liveGoals.map((g, i) => (
                <Link
                  key={i}
                  href={`/matches/${g.matchId}`}
                  className="flex items-center gap-3 text-sm hover:text-accent"
                >
                  <span className="font-display font-bold text-accent shrink-0 w-9">{g.minute}&apos;</span>
                  <span className="truncate">
                    {g.scorer ?? "ประตู"}
                    {g.isOwnGoal && <span className="text-red-400"> (เข้าประตูตัวเอง)</span>}
                  </span>
                  <span className="text-foreground/40 truncate ml-auto text-right">{g.scoringTeam}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {live.length > 0 &&
          [...liveByLeague.entries()].map(([leagueName, ms]) => (
            <div key={leagueName}>
              <h2 className="font-display font-bold mb-3 text-sm text-foreground/70">
                {leagueName} <span className="text-red-400">({ms.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ms.map((m) => (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="hover-lift rounded-xl border border-red-500/30 bg-card p-4 live-glow"
                  >
                    <div className="flex items-center justify-between text-[10px] mb-2">
                      <span className="text-foreground/40">{m.league.name}</span>
                      <span className="text-red-400">
                        ● {(() => {
                          const k = m.events.find((e) => e.type === "KICK_OFF");
                          return k ? computeLiveMinute(k.createdAt) : 0;
                        })()}&apos;
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{m.homeTeam.name}</span>
                      <span className="font-display italic font-black text-2xl text-accent shrink-0">
                        {m.homeScore}-{m.awayScore}
                      </span>
                      <span className="truncate text-sm text-right">{m.awayTeam.name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}

        {todayFinished.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-4">สรุปผลวันนี้</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
              <div className="rounded-xl border border-white/10 bg-card p-4">
                <div className="text-xs text-foreground/45">แข่งจบ</div>
                <div className="font-display italic font-black text-2xl text-foreground mt-1">{todayFinished.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-card p-4">
                <div className="text-xs text-foreground/45">ประตูรวม</div>
                <div className="font-display italic font-black text-2xl text-accent mt-1">{todayGoals}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-card p-4">
                <div className="text-xs text-foreground/45">เสมอ</div>
                <div className="font-display italic font-black text-2xl text-foreground mt-1">{todayDraws}</div>
              </div>
              {biggestWin ? (
                <Link
                  href={`/matches/${biggestWin.id}`}
                  className="rounded-xl border border-accent/30 bg-card p-4 hover:border-accent/60"
                >
                  <div className="text-xs text-foreground/45">ชนะขาดสุด</div>
                  <div className="text-sm mt-1 truncate">
                    <span className="text-accent font-bold">{biggestWin.homeScore}-{biggestWin.awayScore}</span>{" "}
                    {biggestWin.homeScore > biggestWin.awayScore ? biggestWin.homeTeam.name : biggestWin.awayTeam.name}
                  </div>
                </Link>
              ) : (
                <div className="rounded-xl border border-white/10 bg-card p-4">
                  <div className="text-xs text-foreground/45">ชนะขาดสุด</div>
                  <div className="text-sm mt-1 text-foreground/40">ยังไม่มี</div>
                </div>
              )}
            </div>
          </div>
        )}

        {todayFinished.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-4">จบไปแล้ววันนี้ ({todayFinished.length})</h2>
            <div className="flex flex-col gap-2 max-w-2xl">
              {todayFinished.map((m) => (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="grid grid-cols-[1fr_56px_1fr_auto] items-center gap-2 rounded-lg bg-card border border-white/10 px-3 py-2 text-sm hover:border-accent/50"
                >
                  <span className="text-right truncate">{m.homeTeam.name}</span>
                  <span className="text-center font-display font-bold">
                    {m.homeScore}-{m.awayScore}
                  </span>
                  <span className="truncate">{m.awayTeam.name}</span>
                  <span className="text-[10px] text-foreground/40">{m.league.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {nextMatch && live.length === 0 && (
          <Link
            href={`/matches/${nextMatch.id}`}
            className="block rounded-xl border border-accent/30 bg-card p-5 max-w-2xl hover:border-accent/60"
          >
            <div className="text-xs text-foreground/45">คู่ถัดไปเตะใน</div>
            <div className="font-display italic font-black text-3xl text-accent mt-1">
              {formatCountdown(minutesUntil(nextMatch.kickoffAt))}
            </div>
            <div className="text-sm mt-2 truncate">
              {nextMatch.homeTeam.name} <span className="text-foreground/40">พบ</span> {nextMatch.awayTeam.name}
            </div>
            <div className="text-[11px] text-foreground/40 mt-0.5">{nextMatch.league.name}</div>
          </Link>
        )}

        {upcomingByLeague.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-4">คิวแข่งรอลงสนามแต่ละลีก</h2>
            <div className="flex flex-wrap gap-2 max-w-2xl">
              {upcomingByLeague.map((l) => (
                <Link
                  key={l.leagueId}
                  href={`/leagues/${l.leagueId}`}
                  className="rounded-lg bg-card border border-white/10 px-3 py-2 hover:border-accent/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm truncate max-w-[12rem]">{l.name}</span>
                    <span className="font-display font-black text-accent">{l.count}</span>
                  </div>
                  {l.nextKickoff && (
                    <div className="text-[10px] text-foreground/40 mt-0.5">
                      เริ่มอีก {formatCountdown(minutesUntil(l.nextKickoff))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-4">กำลังจะเริ่ม</h2>
            <div className="flex flex-col gap-2 max-w-2xl">
              {upcoming.map((m) => (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="grid grid-cols-[1fr_72px_1fr_auto] items-center gap-2 rounded-lg bg-card border border-white/10 px-3 py-2 text-sm hover:border-accent/50"
                >
                  <span className="text-right truncate">{m.homeTeam.name}</span>
                  <span className="text-center text-accent leading-tight">
                    <span className="block text-xs">
                      {m.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="block text-[9px] text-foreground/40">
                      อีก {formatCountdown(minutesUntil(m.kickoffAt))}
                    </span>
                  </span>
                  <span className="truncate">{m.awayTeam.name}</span>
                  <span className="text-[10px] text-foreground/40">{m.league.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
