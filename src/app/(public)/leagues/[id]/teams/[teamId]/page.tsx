import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { computeStandings } from "@/lib/standings";
import { TeamBadge } from "@/components/team-badge";
import { PointsLineChart } from "@/components/league-charts";
import { ShareLinks } from "@/components/share-links";
import { MobileNav } from "@/components/mobile-nav";

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;
  const team = await prisma.team.findFirst({
    where: { id: teamId, leagueId: id },
    include: { league: true },
  });
  if (!team) return {};
  const title = `${team.name} · ${team.league.name}`;
  const description = `สถิติทีม รายชื่อนักเตะ และผลการแข่งขันของ ${team.name}`;
  return {
    title,
    description,
    openGraph: { title, description },
    alternates: {
      canonical: `https://league-manager-app.vercel.app/leagues/${id}/teams/${teamId}`,
    },
  };
}

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

  const h = await headers();
  const pageUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "league-manager-app.vercel.app"}/leagues/${id}/teams/${teamId}`;

  const teamScorers = new Map<string, { name: string; goals: number }>();
  for (const g of eventsGrouped) {
    if (!g.playerId || g.type !== "GOAL") continue;
    const player = team.players.find((p) => p.id === g.playerId);
    if (player) teamScorers.set(g.playerId, { name: player.name, goals: g._count.playerId });
  }
  const topTeamScorers = [...teamScorers.values()].sort((a, b) => b.goals - a.goals).slice(0, 3);

  const appsByPlayer = new Map(appsGrouped.map((g) => [g.playerId, g._count.playerId]));
  const goalsByPlayer = new Map<string, number>();
  const yellowsByPlayer = new Map<string, number>();
  for (const g of eventsGrouped) {
    if (!g.playerId) continue;
    if (g.type === "GOAL") goalsByPlayer.set(g.playerId, g._count.playerId);
    if (g.type === "YELLOW_CARD") yellowsByPlayer.set(g.playerId, g._count.playerId);
  }

  const allFinished = matches.filter((m) => m.status === "FINISHED");
  const finished = allFinished.slice(-10).reverse();
  const upcoming = matches.filter((m) => m.status !== "FINISHED").slice(0, 5);

  const cleanSheets = allFinished.filter((m) =>
    m.homeTeamId === teamId ? m.awayScore === 0 : m.homeScore === 0
  ).length;

  const oppCount = new Map<string, { wins: number; draws: number; losses: number; games: number; name: string }>();
  for (const m of allFinished) {
    const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
    const oppName = m.homeTeamId === teamId ? m.awayTeam.name : m.homeTeam.name;
    const gf = m.homeTeamId === teamId ? m.homeScore : m.awayScore;
    const ga = m.homeTeamId === teamId ? m.awayScore : m.homeScore;
    const rec = oppCount.get(oppId) ?? { wins: 0, draws: 0, losses: 0, games: 0, name: oppName };
    rec.games++;
    if (gf > ga) rec.wins++;
    else if (gf < ga) rec.losses++;
    else rec.draws++;
    oppCount.set(oppId, rec);
  }
  const rival = [...oppCount.values()].sort((a, b) => b.games - a.games)[0] ?? null;

  const leagueOnly = allFinished
    .filter((m) => m.stage === "LEAGUE")
    .sort((a, b) => a.round - b.round);
  const progressionRounds: number[] = [];
  const progressionPoints: number[] = [];
  let cumPts = 0;
  const splits = {
    HOME: { won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 },
    AWAY: { won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 },
  };
  for (const m of leagueOnly) {
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    cumPts += gf > ga ? 3 : gf === ga ? 1 : 0;
    progressionRounds.push(m.round);
    progressionPoints.push(cumPts);
    const s = splits[isHome ? "HOME" : "AWAY"];
    s.gf += gf;
    s.ga += ga;
    if (gf > ga) s.won++;
    else if (gf < ga) s.lost++;
    else s.drawn++;
  }

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

      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8 flex items-center gap-5">
        <div className="glow-blob w-72 h-72 -top-20 right-10" />
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
            {team.foundedYear && <> · ก่อตั้ง {team.foundedYear}</>}
            {team.coachName && <> · โค้ช {team.coachName}</>}
          </p>
          {(() => {
            const form = row?.form ?? [];
            let winStreak = 0;
            for (const f of form) {
              if (f === "W") winStreak++;
              else break;
            }
            let unbeaten = 0;
            for (const f of form) {
              if (f !== "L") unbeaten++;
              else break;
            }
            return (
              <div className="mt-1.5 flex gap-2">
                {winStreak >= 2 && (
                  <span className="text-[10px] rounded-full bg-accent/15 text-accent px-2 py-0.5">
                    🔥 ชนะติด {winStreak} นัด
                  </span>
                )}
                {unbeaten >= 3 && winStreak < unbeaten && (
                  <span className="text-[10px] rounded-full bg-white/10 text-foreground/70 px-2 py-0.5">
                    🛡 ไม่แพ้ {unbeaten} นัดติด
                  </span>
                )}
              </div>
            );
          })()}
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
          <div className="mt-2 flex items-center gap-3">
            <ShareLinks url={pageUrl} text={`${team.name} · ${team.league.name}`} />
            <a
              href={`/leagues/${id}/calendar?team=${teamId}`}
              className="text-xs text-foreground/60 hover:text-accent"
            >
              📅 ปฏิทินทีม (.ics)
            </a>
          </div>
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
            <Stat value={cleanSheets} label="คลีนชีต" />
            <Stat
              value={row.played > 0 ? (row.goalsFor / row.played).toFixed(1) : "-"}
              label="ประตูเฉลี่ย/นัด"
            />
          </div>
        )}

        {leagueOnly.length > 0 && (
          <p className="text-sm text-foreground/60">
            ฟอร์ม 5 นัดหลังสุด: ชนะ{" "}
            <b className="text-accent">{(row?.form ?? []).filter((f) => f === "W").length}</b> เสมอ{" "}
            <b>{(row?.form ?? []).filter((f) => f === "D").length}</b> แพ้{" "}
            <b className="text-red-400">{(row?.form ?? []).filter((f) => f === "L").length}</b>
            {upcoming[0] && (
              <>
                {" "}
                · นัดต่อไปพบ{" "}
                <b>
                  {upcoming[0].homeTeamId === teamId
                    ? upcoming[0].awayTeam.name
                    : upcoming[0].homeTeam.name}
                </b>
                {(() => {
                  const oppId =
                    upcoming[0].homeTeamId === teamId
                      ? upcoming[0].awayTeamId
                      : upcoming[0].homeTeamId;
                  const last = [...allFinished]
                    .reverse()
                    .find((m) => m.homeTeamId === oppId || m.awayTeamId === oppId);
                  return last ? (
                    <span className="text-foreground/45">
                      {" "}
                      (เจอกันล่าสุด {last.homeScore}-{last.awayScore})
                    </span>
                  ) : null;
                })()}
              </>
            )}
          </p>
        )}

        {leagueOnly.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm">
              <div className="text-xs text-foreground/50 mb-1">ผลงานเหย้า</div>
              <div className="font-display font-bold">
                ชนะ {splits.HOME.won} เสมอ {splits.HOME.drawn} แพ้ {splits.HOME.lost}
              </div>
              <div className="text-xs text-foreground/50 mt-1">
                ได้-เสีย {splits.HOME.gf}-{splits.HOME.ga}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm">
              <div className="text-xs text-foreground/50 mb-1">ผลงานเยือน</div>
              <div className="font-display font-bold">
                ชนะ {splits.AWAY.won} เสมอ {splits.AWAY.drawn} แพ้ {splits.AWAY.lost}
              </div>
              <div className="text-xs text-foreground/50 mt-1">
                ได้-เสีย {splits.AWAY.gf}-{splits.AWAY.ga}
              </div>
            </div>
          </div>
        )}

        {progressionPoints.length >= 2 && (
          <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
            <h2 className="font-display font-bold mb-3">แต้มสะสมของทีม</h2>
            <PointsLineChart
              rounds={progressionRounds}
              series={[{ name: team.name, color: team.color, points: progressionPoints }]}
            />
          </div>
        )}

        {topTeamScorers.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md">
            <div className="text-xs text-foreground/50 mb-2">⚽ ดาวซัลโวของทีม</div>
            <div className="space-y-1">
              {topTeamScorers.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span>
                    <span className="text-foreground/40 mr-2">{i + 1}</span>
                    {s.name}
                  </span>
                  <span className="font-display font-bold text-accent">{s.goals}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {oppCount.size >= 2 && (
          <div className="rounded-xl border border-white/10 bg-card p-4 max-w-2xl">
            <div className="text-xs text-foreground/50 mb-2">สถิติกับทุกคู่แข่ง (ช-ส-พ)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {[...oppCount.values()]
                .sort((a, b) => b.games - a.games)
                .map((o) => (
                  <div key={o.name} className="rounded-md bg-white/5 px-2.5 py-1.5 flex justify-between gap-2">
                    <span className="truncate">{o.name}</span>
                    <span className="shrink-0 text-foreground/60">
                      {o.wins}-{o.draws}-{o.losses}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {rival && rival.games >= 2 && (
          <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md">
            ⚔ คู่ปรับที่เจอบ่อยสุด:{" "}
            <span className="font-display font-bold">{rival.name}</span>{" "}
            <span className="text-foreground/50 text-xs">
              เจอกัน {rival.games} นัด · ชนะ {rival.wins} เสมอ {rival.draws} แพ้ {rival.losses}
            </span>
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
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photoUrl}
                    alt={p.name}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="w-8 font-display font-bold text-accent">{p.number}</span>
                )}
                <span className="flex-1">
                  {p.photoUrl && <span className="text-foreground/40 mr-1.5">#{p.number}</span>}
                  {p.name}
                </span>
                <span className="w-14 text-foreground/50 text-xs">{p.position}</span>
                {p.status === "INJURED" && (
                  <span className="text-[10px] rounded-full bg-yellow-400/10 text-yellow-400 px-2 py-0.5 shrink-0">
                    บาดเจ็บ
                  </span>
                )}
                {p.status === "BANNED" && (
                  <span className="text-[10px] rounded-full bg-red-500/10 text-red-400 px-2 py-0.5 shrink-0">
                    แบน
                  </span>
                )}
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
