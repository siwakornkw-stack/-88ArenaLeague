import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { getTopScorers } from "@/lib/topScorers";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const yearFilter = Number(year) || null;

  const leagues = await prisma.league.findMany({
    where: { status: "FINISHED", hidden: false, ...(yearFilter ? { seasonYear: yearFilter } : {}) },
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
      if (finalMatch) {
        const homeWon = finalMatch.homeScore >= finalMatch.awayScore;
        championName = homeWon ? finalMatch.homeTeam.name : finalMatch.awayTeam.name;
        runnerUp = homeWon ? finalMatch.awayTeam.name : finalMatch.homeTeam.name;
        note = `ชนะนัดชิง ${finalMatch.homeScore}-${finalMatch.awayScore}`;
      }

      return { league, championName, runnerUp, note, topScorer: topScorers[0] ?? null };
    })
  );

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
        <p className="mt-1 text-sm text-foreground/55">แชมป์และดาวซัลโวของทุกฤดูกาลที่จบแล้ว</p>
        {allYears.length > 1 && (
          <form method="get" className="mt-4 flex items-center gap-2">
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
              <div className="rounded-xl border border-accent/30 bg-card p-4 max-w-md text-sm">
                👑 คว้าแชมป์มากสุด:{" "}
                <span className="font-display font-bold text-accent">{top[0]}</span> ({top[1]}{" "}
                สมัย)
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
            {entries.map(({ league, championName, runnerUp, note, topScorer }) => (
              <Link
                key={league.id}
                href={`/leagues/${league.id}`}
                className="hover-lift rounded-2xl border border-accent/30 bg-gradient-to-r from-[#1a2e12] to-card p-5 hover:border-accent/60"
              >
                <div className="text-xs text-foreground/50">
                  ฤดูกาล {league.seasonYear} · {league.name}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-3xl">🏆</span>
                  <div>
                    <div className="font-display italic font-extrabold text-xl text-accent">
                      {championName ?? "-"}
                    </div>
                    {note && <div className="text-xs text-foreground/60">{note}</div>}
                  </div>
                </div>
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
