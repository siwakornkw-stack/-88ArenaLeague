import Link from "next/link";
import { prisma } from "@/lib/db";
import { getFeaturedLeagues, type FeaturedLeague } from "@/lib/featuredLeagues";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

function LeagueCard({
  lg,
  lastPlayed,
  goalStats,
  nextKickoff,
  isBiggest,
}: {
  lg: FeaturedLeague;
  lastPlayed?: Date | null;
  goalStats?: { goals: number; avg: number };
  nextKickoff?: Date | null;
  isBiggest?: boolean;
}) {
  const progressPct =
    lg.totalRounds > 0 ? Math.min(100, Math.round((lg.round / lg.totalRounds) * 100)) : 0;
  return (
    <Link
      href={`/leagues/${lg.id}`}
      className="hover-lift rounded-2xl border border-white/10 bg-card p-5 hover:border-accent/50"
    >
      <div className="font-display italic font-extrabold text-xl text-foreground">
        {lg.name}
        {lg.registrationOpen && (
          <span className="ml-2 align-middle text-[10px] font-sans not-italic font-semibold rounded-full bg-yellow-400/15 text-yellow-400 px-2 py-0.5">
            เปิดรับสมัคร
          </span>
        )}
        {isBiggest && (
          <span className="ml-2 align-middle text-[10px] font-sans not-italic font-semibold rounded-full bg-accent/15 text-accent px-2 py-0.5">
            👑 ลีกใหญ่สุด
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-foreground/45">{lg.type}</div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-foreground/60">
        <span>⚽ {lg.teams} ทีม</span>
        {lg.totalRounds > 0 ? (
          <span>📅 นัดที่ {lg.round}/{lg.totalRounds}</span>
        ) : (
          <span>ยังไม่เริ่มแข่ง</span>
        )}
        {lg.live > 0 && (
          <span className="text-accent flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse inline-block" />
            {lg.live} แมตช์สด
          </span>
        )}
        {lastPlayed && (
          <span>
            🕑 เตะล่าสุด{" "}
            {lastPlayed.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
          </span>
        )}
        {nextKickoff && (
          <span className="text-foreground/70">
            ⏭️ นัดต่อไป{" "}
            {nextKickoff.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
          </span>
        )}
        {goalStats && goalStats.goals > 0 && (
          <span>
            🥅 {goalStats.goals} ประตู{" "}
            <span className="text-foreground/40">({goalStats.avg.toFixed(1)}/นัด)</span>
          </span>
        )}
      </div>
      {lg.totalRounds > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-foreground/45 mb-1">
            <span>ความคืบหน้าฤดูกาล</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}
      {lg.leaderName && lg.leaderForm.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-foreground/55">
          <span className="truncate">ฟอร์มจ่าฝูง</span>
          <span className="flex gap-1">
            {lg.leaderForm.slice(-5).map((r, i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-sm grid place-items-center text-[9px] font-bold ${
                  r === "W"
                    ? "bg-accent/20 text-accent"
                    : r === "D"
                      ? "bg-white/10 text-foreground/60"
                      : "bg-red-500/20 text-red-400"
                }`}
              >
                {r === "W" ? "ช" : r === "D" ? "ส" : "พ"}
              </span>
            ))}
          </span>
        </div>
      )}
      {lg.top3.length > 0 && (
        <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm space-y-1">
          {lg.top3.map((t, i) => (
            <div key={t.name} className="flex items-center justify-between">
              <span className="text-foreground/80">
                <span className="font-display font-bold text-foreground/40 mr-2">{i + 1}</span>
                {t.name}
              </span>
              <span className="text-foreground/50 text-xs">{t.points} แต้ม</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

export default async function LeaguesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const { q = "", sort = "latest" } = await searchParams;
  const query = q.trim();

  const [leagues, finishedIds, liveNow, totalTeams, lastPlayedRows, goalRows, nextKickoffRows] =
    await Promise.all([
      getFeaturedLeagues(100),
      prisma.league.findMany({ where: { status: "FINISHED" }, select: { id: true } }),
      prisma.match.count({ where: { status: "LIVE" } }),
      prisma.team.count({ where: { league: { status: { not: "DRAFT" } } } }),
      prisma.match.groupBy({
        by: ["leagueId"],
        where: { status: "FINISHED" },
        _max: { kickoffAt: true },
      }),
      prisma.match.groupBy({
        by: ["leagueId"],
        where: { status: "FINISHED", stage: "LEAGUE" },
        _sum: { homeScore: true, awayScore: true },
        _count: { _all: true },
      }),
      prisma.match.groupBy({
        by: ["leagueId"],
        where: { status: "SCHEDULED", kickoffAt: { gte: new Date() } },
        _min: { kickoffAt: true },
      }),
    ]);
  const finishedSet = new Set(finishedIds.map((l) => l.id));
  const lastPlayedMap = new Map(lastPlayedRows.map((r) => [r.leagueId, r._max.kickoffAt]));
  const nextKickoffMap = new Map(nextKickoffRows.map((r) => [r.leagueId, r._min.kickoffAt]));
  const goalsMap = new Map(
    goalRows.map((r) => {
      const goals = (r._sum.homeScore ?? 0) + (r._sum.awayScore ?? 0);
      const played = r._count._all;
      return [r.leagueId, { goals, avg: played > 0 ? goals / played : 0 }];
    })
  );

  const goalsOf = (id: string) => goalsMap.get(id)?.goals ?? 0;

  let filtered = query
    ? leagues.filter((lg) => lg.name.toLowerCase().includes(query.toLowerCase()))
    : leagues;
  if (sort === "name") {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "th"));
  } else if (sort === "goals") {
    filtered = [...filtered].sort((a, b) => goalsOf(b.id) - goalsOf(a.id));
  }

  // Biggest league by team count (across the visible set), for a milestone badge.
  const biggestLeagueId = filtered.reduce<{ id: string; teams: number } | null>(
    (best, lg) => (lg.teams > (best?.teams ?? 0) ? { id: lg.id, teams: lg.teams } : best),
    null
  )?.id;

  const active = filtered.filter((lg) => !finishedSet.has(lg.id));
  const finished = filtered.filter((lg) => finishedSet.has(lg.id));

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ลีกทั้งหมด", href: "/leagues", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
          ลีก<span className="text-accent">ทั้งหมด</span>
        </h1>
        <p className="mt-1 text-sm text-foreground/55">
          {filtered.length} ลีกที่เปิดให้ชม · {totalTeams} ทีม
          {liveNow > 0 && <span className="text-accent"> · ● {liveNow} แมตช์สดตอนนี้</span>}
        </p>
        <form method="get" className="mt-4 flex flex-wrap gap-2 max-w-lg">
          <input
            name="q"
            defaultValue={query}
            placeholder="ค้นหาชื่อลีก"
            className="flex-1 min-w-40 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="latest">ล่าสุดก่อน</option>
            <option value="name">เรียงตามชื่อ</option>
            <option value="goals">ยิงประตูมากสุด</option>
          </select>
          <button type="submit" className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm">
            ค้นหา
          </button>
        </form>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-10">
        {filtered.length === 0 && (
          <p className="text-foreground/50 text-sm">
            {query ? `ไม่พบลีกชื่อ "${query}"` : "ยังไม่มีลีกที่เปิดให้ชมสาธารณะ"}
          </p>
        )}

        {active.length > 0 && (
          <div>
            <h2 className="font-display font-bold text-lg mb-4">กำลังแข่งขัน ({active.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {active.map((lg) => (
                <LeagueCard
                  key={lg.id}
                  lg={lg}
                  lastPlayed={lastPlayedMap.get(lg.id)}
                  goalStats={goalsMap.get(lg.id)}
                  nextKickoff={nextKickoffMap.get(lg.id)}
                  isBiggest={lg.id === biggestLeagueId}
                />
              ))}
            </div>
          </div>
        )}

        {finished.length > 0 && (
          <div>
            <h2 className="font-display font-bold text-lg mb-4 text-foreground/70">
              จบฤดูกาลแล้ว ({finished.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {finished.map((lg) => (
                <LeagueCard
                  key={lg.id}
                  lg={lg}
                  lastPlayed={lastPlayedMap.get(lg.id)}
                  goalStats={goalsMap.get(lg.id)}
                  nextKickoff={nextKickoffMap.get(lg.id)}
                  isBiggest={lg.id === biggestLeagueId}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
