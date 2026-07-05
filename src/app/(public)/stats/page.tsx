import Link from "next/link";
import { prisma } from "@/lib/db";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "สถิติรวมทุกลีก",
  description: "ตัวเลขรวมทั้งระบบ 88ArenaLeague",
};

export default async function GlobalStatsPage() {
  const [finished, leagues, topScorers] = await Promise.all([
    prisma.match.findMany({
      where: { status: "FINISHED", league: { hidden: false } },
      select: { homeScore: true, awayScore: true, leagueId: true, spectators: true },
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
  ]);

  const totalGoals = finished.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const totalSpectators = finished.reduce((s, m) => s + (m.spectators ?? 0), 0);

  const perLeague = leagues
    .map((lg) => {
      const ms = finished.filter((m) => m.leagueId === lg.id);
      const goals = ms.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
      return { ...lg, matches: ms.length, goals, avg: ms.length > 0 ? goals / ms.length : 0 };
    })
    .filter((l) => l.matches > 0)
    .sort((a, b) => b.avg - a.avg);

  const scorerPlayers = await prisma.player.findMany({
    where: { id: { in: topScorers.map((g) => g.playerId!) } },
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

          <div className="rounded-xl border border-white/10 bg-card p-5">
            <h2 className="font-display font-bold mb-3">ดาวซัลโวข้ามทุกลีก</h2>
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
