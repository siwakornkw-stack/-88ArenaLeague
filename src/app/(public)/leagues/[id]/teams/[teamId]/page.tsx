import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { TeamBadge } from "@/components/team-badge";
import { MobileNav } from "@/components/mobile-nav";

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

export default async function PublicTeamPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;

  const team = await prisma.team.findFirst({
    where: { id: teamId, leagueId: id },
    include: { league: true, players: { orderBy: { number: "asc" } } },
  });
  if (!team) notFound();

  const [standings, matches, appsGrouped, eventsGrouped] = await Promise.all([
    computeStandings(id),
    prisma.match.findMany({
      where: { leagueId: id, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
    }),
    prisma.matchLineup.groupBy({
      by: ["playerId"],
      where: { player: { teamId }, match: { status: { in: ["LIVE", "FINISHED"] } } },
      _count: { playerId: true },
    }),
    prisma.matchEvent.groupBy({
      by: ["playerId", "type"],
      where: {
        playerId: { not: null },
        type: { in: ["GOAL", "YELLOW_CARD"] },
        player: { teamId },
      },
      _count: { playerId: true },
    }),
  ]);

  const rank = standings.findIndex((r) => r.teamId === teamId) + 1;
  const row = standings.find((r) => r.teamId === teamId) ?? null;

  const appsByPlayer = new Map(appsGrouped.map((g) => [g.playerId, g._count.playerId]));
  const goalsByPlayer = new Map<string, number>();
  const yellowsByPlayer = new Map<string, number>();
  for (const g of eventsGrouped) {
    if (!g.playerId) continue;
    if (g.type === "GOAL") goalsByPlayer.set(g.playerId, g._count.playerId);
    if (g.type === "YELLOW_CARD") yellowsByPlayer.set(g.playerId, g._count.playerId);
  }

  const finished = matches.filter((m) => m.status === "FINISHED").slice(-10).reverse();
  const upcoming = matches.filter((m) => m.status !== "FINISHED").slice(0, 5);

  const resultFor = (m: (typeof matches)[number]): "W" | "D" | "L" => {
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    return gf > ga ? "W" : gf < ga ? "L" : "D";
  };

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ตาราง", href: `/leagues/${id}?tab=standings` },
    { icon: "👥", label: "ทีม", href: `/leagues/${id}?tab=teams`, active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 md:px-16 py-4 text-sm">
        <Link href={`/leagues/${id}?tab=teams`} className="text-foreground/60 hover:text-accent">
          ← {team.league.name}
        </Link>
      </div>

      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8 flex items-center gap-5">
        <TeamBadge
          abbr={team.abbr}
          color={team.color}
          logoUrl={team.logoUrl}
          className="w-16 h-16 text-lg border-2 border-white/20"
        />
        <div>
          <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
            {team.name}
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            {team.league.name}
            {rank > 0 && row && <> · อันดับ {rank} · {row.points} แต้ม</>}
          </p>
          {row && row.form.length > 0 && (
            <div className="flex gap-1 mt-2">
              {row.form.map((f, i) => (
                <span
                  key={i}
                  className={`w-5 h-5 rounded text-[10px] font-bold grid place-items-center ${FORM_LABEL[f].className}`}
                >
                  {FORM_LABEL[f].t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-8">
        {row && (
          <div className="flex flex-wrap gap-8 rounded-xl border border-white/10 bg-card p-5 text-sm">
            <Stat value={row.played} label="ลงแข่ง" />
            <Stat value={row.won} label="ชนะ" />
            <Stat value={row.drawn} label="เสมอ" />
            <Stat value={row.lost} label="แพ้" />
            <Stat value={`${row.goalsFor}-${row.goalsAgainst}`} label="ได้-เสีย" />
            <Stat value={row.points} label="แต้ม" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
            <h2 className="font-display font-bold px-5 py-4 border-b border-white/10">
              รายชื่อนักเตะ
            </h2>
            <div className="flex items-center gap-3 px-5 py-2 text-xs text-foreground/40">
              <span className="w-8">#</span>
              <span className="flex-1">ชื่อ</span>
              <span className="w-14">ตำแหน่ง</span>
              <span className="w-10 text-center">ลงสนาม</span>
              <span className="w-8 text-center">⚽</span>
              <span className="w-8 text-center">🟨</span>
            </div>
            {team.players.map((p) => (
              <Link
                key={p.id}
                href={`/leagues/${id}/players/${p.id}`}
                className="flex items-center gap-3 px-5 py-2.5 text-sm border-t border-white/5 hover:bg-white/5"
              >
                <span className="w-8 font-display font-bold text-accent">{p.number}</span>
                <span className="flex-1">{p.name}</span>
                <span className="w-14 text-foreground/50 text-xs">{p.position}</span>
                <span className="w-10 text-center text-foreground/70">
                  {appsByPlayer.get(p.id) ?? 0}
                </span>
                <span className="w-8 text-center text-accent">{goalsByPlayer.get(p.id) ?? 0}</span>
                <span className="w-8 text-center text-yellow-400">
                  {yellowsByPlayer.get(p.id) ?? 0}
                </span>
              </Link>
            ))}
            {team.players.length === 0 && (
              <p className="text-foreground/50 text-sm px-5 py-4">ยังไม่มีนักเตะ</p>
            )}
          </div>

          <div className="space-y-6">
            {upcoming.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h2 className="font-display font-bold mb-3">โปรแกรมถัดไป</h2>
                <div className="flex flex-col gap-2">
                  {upcoming.map((m) => (
                    <Link
                      key={m.id}
                      href={`/matches/${m.id}`}
                      className="grid grid-cols-[1fr_64px_1fr] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                    >
                      <span className="text-right">{m.homeTeam.name}</span>
                      <span className="text-center rounded bg-accent text-black text-xs font-bold py-1">
                        {m.status === "LIVE"
                          ? `${m.homeScore}-${m.awayScore}`
                          : m.kickoffAt.toLocaleDateString("th-TH", {
                              day: "numeric",
                              month: "short",
                            })}
                      </span>
                      <span>{m.awayTeam.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h2 className="font-display font-bold mb-3">ผลย้อนหลัง</h2>
              <div className="flex flex-col gap-2">
                {finished.map((m) => {
                  const res = resultFor(m);
                  return (
                    <Link
                      key={m.id}
                      href={`/matches/${m.id}`}
                      className="grid grid-cols-[20px_1fr_56px_1fr] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                    >
                      <span
                        className={`w-5 h-5 rounded text-[10px] font-bold grid place-items-center ${FORM_LABEL[res].className}`}
                      >
                        {FORM_LABEL[res].t}
                      </span>
                      <span className="text-right">{m.homeTeam.name}</span>
                      <span className="text-center font-display font-bold">
                        {m.homeScore}-{m.awayScore}
                      </span>
                      <span>{m.awayTeam.name}</span>
                    </Link>
                  );
                })}
                {finished.length === 0 && (
                  <p className="text-foreground/50 text-sm">ยังไม่มีผลการแข่งขัน</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="font-display italic font-extrabold text-2xl text-accent">{value}</div>
      <div className="text-xs text-foreground/55">{label}</div>
    </div>
  );
}
