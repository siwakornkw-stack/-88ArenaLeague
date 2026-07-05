import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { getTopScorers } from "@/lib/topScorers";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; sort?: string }>;
}) {
  const { year, sort } = await searchParams;
  const yearFilter = Number(year) || null;
  const sortMode = sort === "points" ? "points" : "year";

  const leagues = await prisma.league.findMany({
    where: { status: "FINISHED", hidden: false, ...(yearFilter ? { seasonYear: yearFilter } : {}) },
    include: { _count: { select: { teams: true, matches: true } } },
    orderBy: [{ seasonYear: "desc" }, { createdAt: "desc" }],
  });
  const allYears = await prisma.league.findMany({
    where: { status: "FINISHED" },
    select: { seasonYear: true },
    distinct: ["seasonYear"],
    orderBy: { seasonYear: "desc" },
  });

  const entries = await Promise.all(
    leagues.map(async (league) => {
      const [standings, topScorers, finalMatch] = await Promise.all([
        computeStandings(league.id),
        getTopScorers(league.id, 1),
        prisma.match.findFirst({
          where: { leagueId: league.id, stage: "FINAL", status: "FINISHED" },
          include: { homeTeam: true, awayTeam: true },
        }),
      ]);

      let championName = standings[0]?.teamName ?? null;
      let runnerUp = standings[1]?.teamName ?? null;
      let note = standings[0] ? `${standings[0].points} แต้ม` : null;
      let finalMargin: number | null = null;
      if (finalMatch) {
        const homeWon = finalMatch.homeScore >= finalMatch.awayScore;
        championName = homeWon ? finalMatch.homeTeam.name : finalMatch.awayTeam.name;
        runnerUp = homeWon ? finalMatch.awayTeam.name : finalMatch.homeTeam.name;
        note = `ชนะนัดชิง ${finalMatch.homeScore}-${finalMatch.awayScore}`;
        finalMargin = Math.abs(finalMatch.homeScore - finalMatch.awayScore);
      }

      const leader = standings[0] ?? null;

      return {
        league,
        championName,
        runnerUp,
        note,
        topScorer: topScorers[0] ?? null,
        finalMatch,
        finalMargin,
        championPoints: leader?.points ?? null,
        championPlayed: leader?.played ?? 0,
        championLost: leader?.lost ?? 0,
      };
    })
  );

  // season grid order: default newest-first (entries already sorted), or by champion's league points
  const sortedEntries =
    sortMode === "points"
      ? [...entries].sort((a, b) => (b.championPoints ?? -1) - (a.championPoints ?? -1))
      : entries;

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "หอเกียรติยศ", href: "/champions", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
          หอ<span className="text-accent">เกียรติยศ</span>
        </h1>
        <p className="mt-1 text-sm text-foreground/55">
          แชมป์และดาวซัลโวของทุกฤดูกาลที่จบแล้ว
          {entries.length > 0 && (
            <>
              {" "}
              · {entries.length} ฤดูกาล ·{" "}
              {new Set(entries.map((e) => e.championName).filter(Boolean)).size} ทีมที่เคยเป็นแชมป์
            </>
          )}
        </p>
        {(allYears.length > 1 || entries.length > 1) && (
          <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
            {allYears.length > 1 && (
              <select
                name="year"
                defaultValue={yearFilter ?? ""}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">ทุกปี</option>
                {allYears.map((y) => (
                  <option key={y.seasonYear} value={y.seasonYear}>
                    ฤดูกาล {y.seasonYear}
                  </option>
                ))}
              </select>
            )}
            {entries.length > 1 && (
              <select
                name="sort"
                defaultValue={sortMode}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="year">เรียงตามปีล่าสุด</option>
                <option value="points">เรียงตามแต้มแชมป์</option>
              </select>
            )}
            <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
              ดู
            </button>
          </form>
        )}
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-8">
        {entries.length > 1 &&
          (() => {
            const titleCount = new Map<string, number>();
            for (const e of entries) {
              if (e.championName)
                titleCount.set(e.championName, (titleCount.get(e.championName) ?? 0) + 1);
            }
            const top = [...titleCount.entries()].sort((a, b) => b[1] - a[1])[0];
            return top && top[1] > 1 ? (
              <div className="rounded-xl border border-accent/30 bg-card p-4 max-w-md text-sm space-y-2">
                <div>
                  👑 คว้าแชมป์มากสุด:{" "}
                  <span className="font-display font-bold text-accent">{top[0]}</span> ({top[1]}{" "}
                  สมัย)
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-foreground/60">
                  {[...titleCount.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, n]) => (
                      <span key={name} className="rounded-full bg-white/5 px-2.5 py-0.5">
                        {name} ×{n}
                      </span>
                    ))}
                </div>
              </div>
            ) : null;
          })()}

        {(() => {
          // all-time golden boot: aggregate each season's top scorer across every finished season
          const bootTotals = new Map<string, { name: string; team: string; goals: number; seasons: number }>();
          for (const e of entries) {
            if (!e.topScorer) continue;
            const key = e.topScorer.playerId;
            const cur = bootTotals.get(key) ?? {
              name: e.topScorer.playerName,
              team: e.topScorer.teamName,
              goals: 0,
              seasons: 0,
            };
            cur.goals += e.topScorer.goals;
            cur.seasons += 1;
            bootTotals.set(key, cur);
          }
          const boots = [...bootTotals.values()].sort((a, b) => b.goals - a.goals).slice(0, 5);
          return boots.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-card p-5 max-w-md">
              <div className="text-sm font-display font-bold text-foreground">
                ⚽ ดาวซัลโวตลอดกาล
              </div>
              <div className="mt-1 text-xs text-foreground/50">
                รวมประตูจากดาวซัลโวของทุกฤดูกาลที่จบแล้ว
              </div>
              <ol className="mt-3 space-y-2 text-sm">
                {boots.map((b, i) => (
                  <li key={b.name + b.team} className="flex items-center gap-3">
                    <span className="w-5 text-right text-foreground/40 tabular-nums">{i + 1}</span>
                    <span className="flex-1 truncate">
                      <span className="text-foreground">{b.name}</span>{" "}
                      <span className="text-foreground/50">· {b.team}</span>
                      {b.seasons > 1 && (
                        <span className="ml-1 text-[10px] text-accent">({b.seasons} ฤดูกาล)</span>
                      )}
                    </span>
                    <span className="font-display font-bold text-accent tabular-nums">{b.goals}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null;
        })()}

        {(() => {
          // biggest final-win callout: the most emphatic playoff final across all seasons
          const withFinals = entries.filter((e) => e.finalMatch && e.finalMargin !== null);
          if (withFinals.length === 0) return null;
          const best = withFinals.reduce((a, b) => (b.finalMargin! > a.finalMargin! ? b : a));
          if (best.finalMargin! < 1) return null;
          const fm = best.finalMatch!;
          return (
            <Link
              href={`/matches/${fm.id}`}
              className="hover-lift block rounded-xl border border-accent/30 bg-card p-4 max-w-md text-sm hover:border-accent/60"
            >
              <div className="text-xs text-foreground/50">
                นัดชิงชนะขาดลอยสุด · ฤดูกาล {best.league.seasonYear}
              </div>
              <div className="mt-1">
                💥 <span className="font-display font-bold text-accent">{best.championName}</span>{" "}
                <span className="text-foreground/60">ถล่ม</span>{" "}
                <span className="text-foreground">{best.runnerUp}</span>{" "}
                <span className="text-foreground/50">
                  {fm.homeScore}-{fm.awayScore} (ห่าง {best.finalMargin} ประตู)
                </span>
              </div>
            </Link>
          );
        })()}

        {(() => {
          // record golden boot: the single best individual top-scorer season (not a cumulative total)
          const best = entries
            .filter((e) => e.topScorer)
            .reduce<(typeof entries)[number] | null>(
              (a, b) => (a === null || b.topScorer!.goals > a.topScorer!.goals ? b : a),
              null
            );
          return best && best.topScorer!.goals > 0 ? (
            <div className="rounded-xl border border-accent/30 bg-card p-4 max-w-md text-sm">
              <div className="text-xs text-foreground/50">
                สถิติดาวซัลโวฤดูกาลเดียวสูงสุด · ฤดูกาล {best.league.seasonYear}
              </div>
              <div className="mt-1">
                🎯 <span className="font-display font-bold text-accent">{best.topScorer!.playerName}</span>{" "}
                <span className="text-foreground/50">· {best.topScorer!.teamName}</span>{" "}
                <span className="text-foreground">ยิง {best.topScorer!.goals} ประตู</span>
              </div>
            </div>
          ) : null;
        })()}

        {(() => {
          // nearly men: teams that finished runner-up most often across all finished seasons
          const nearMiss = new Map<string, number>();
          for (const e of entries) {
            if (e.runnerUp) nearMiss.set(e.runnerUp, (nearMiss.get(e.runnerUp) ?? 0) + 1);
          }
          const top = [...nearMiss.entries()].sort((a, b) => b[1] - a[1])[0];
          return top && top[1] > 1 ? (
            <div className="rounded-xl border border-white/10 bg-card p-4 max-w-md text-sm space-y-2">
              <div>
                🥈 รองแชมป์บ่อยสุด:{" "}
                <span className="font-display font-bold text-foreground">{top[0]}</span> ({top[1]} ครั้ง)
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-foreground/60">
                {[...nearMiss.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, n]) => (
                    <span key={name} className="rounded-full bg-white/5 px-2.5 py-0.5">
                      {name} ×{n}
                    </span>
                  ))}
              </div>
            </div>
          ) : null;
        })()}

        {entries[0] && (
          <div className="rounded-2xl border border-accent/50 bg-gradient-to-r from-[#22380f] to-card p-6 max-w-2xl live-glow">
            <div className="text-xs text-foreground/50">แชมป์ล่าสุด · ฤดูกาล {entries[0].league.seasonYear}</div>
            <div className="mt-1 font-display italic font-black text-3xl text-accent">
              🏆 {entries[0].championName}
            </div>
            <div className="text-sm text-foreground/60 mt-1">
              {entries[0].league.name}
              {entries[0].note && <> · {entries[0].note}</>}
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-foreground/50 text-sm">ยังไม่มีฤดูกาลที่จบการแข่งขัน</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            {sortedEntries.map(
              ({
                league,
                championName,
                runnerUp,
                note,
                topScorer,
                championPoints,
                championPlayed,
                championLost,
              }) => (
              <Link
                key={league.id}
                href={`/leagues/${league.id}`}
                className="hover-lift rounded-2xl border border-accent/30 bg-gradient-to-r from-[#1a2e12] to-card p-5 hover:border-accent/60"
              >
                <div className="text-xs text-foreground/50">
                  ฤดูกาล {league.seasonYear} · {league.name} · {league._count.teams} ทีม ·{" "}
                  {league._count.matches} นัด
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-3xl">🏆</span>
                  <div>
                    <div className="font-display italic font-extrabold text-xl text-accent">
                      {championName ?? "-"}
                    </div>
                    {note && <div className="text-xs text-foreground/60">{note}</div>}
                    {championPlayed > 0 && championLost === 0 && (
                      <div className="mt-1 inline-block rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
                        🛡️ ไร้พ่ายทั้งฤดูกาล
                      </div>
                    )}
                  </div>
                </div>
                {championPoints !== null && (
                  <div className="mt-2 text-xs text-foreground/60">
                    🧮 แต้มลีก: <span className="text-foreground">{championPoints}</span> แต้ม
                    {championPlayed > 0 && <> ({championPlayed} นัด)</>}
                  </div>
                )}
                {runnerUp && (
                  <div className="mt-3 text-xs text-foreground/60">
                    🥈 รองแชมป์: <span className="text-foreground">{runnerUp}</span>
                  </div>
                )}
                {topScorer && (
                  <div className="mt-1 text-xs text-foreground/60">
                    ⚽ ดาวซัลโว: <span className="text-foreground">{topScorer.playerName}</span> (
                    {topScorer.goals} ประตู)
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
