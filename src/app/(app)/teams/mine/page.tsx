import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ShareLinks } from "@/components/share-links";
import { computeStandings, computeStandingsUpTo } from "@/lib/standings";
import {
  addPlayer,
  updatePlayerInfo,
  updatePlayerStatus,
  deletePlayer,
  setLineup,
  copyLastLineup,
  clearLineup,
  updateMyTeam,
  importPlayers,
} from "./actions";
import { LINEUP_SIZE } from "@/lib/constants";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ปกติ",
  INJURED: "บาดเจ็บ",
  BANNED: "โดนแบน",
};

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

const STATUS_FILTERS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "ACTIVE", label: "พร้อมลงเล่น" },
  { value: "OUT", label: "ไม่พร้อม" },
] as const;

export default async function MyTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; imported?: string; skipped?: string; sort?: string }>;
}) {
  const session = await getSession();
  if (session?.role !== "TEAM_MANAGER") redirect("/dashboard");

  const { status, imported, skipped, sort } = await searchParams;
  const statusFilter = status ?? "all";
  const sortByGoals = sort === "goals";
  const sortByApps = sort === "apps";

  const team = await prisma.team.findFirst({
    where: { managers: { some: { id: session.userId } } },
    include: { players: { orderBy: { number: "asc" } } },
  });

  if (!team) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-display font-bold text-3xl">ทีมของฉัน</h1>
        <p className="text-foreground/60 mt-2">ยังไม่มีทีมที่คุณดูแล ติดต่อผู้ดูแลระบบ</p>
      </div>
    );
  }

  const [nextMatch, standings, cleanSheets, appsGrouped, eventsGrouped, teamMatches] = await Promise.all([
    prisma.match.findFirst({
      where: {
        status: "SCHEDULED",
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      orderBy: { kickoffAt: "asc" },
      include: {
        homeTeam: true,
        awayTeam: true,
        lineups: { where: { player: { teamId: team.id } } },
      },
    }),
    computeStandings(team.leagueId),
    prisma.match.count({
      where: {
        status: "FINISHED",
        OR: [
          { homeTeamId: team.id, awayScore: 0 },
          { awayTeamId: team.id, homeScore: 0 },
        ],
      },
    }),
    prisma.matchLineup.groupBy({
      by: ["playerId"],
      where: { player: { teamId: team.id }, match: { status: { in: ["LIVE", "FINISHED"] } } },
      _count: { playerId: true },
    }),
    prisma.matchEvent.groupBy({
      by: ["playerId", "type"],
      where: { playerId: { not: null }, type: { in: ["GOAL", "YELLOW_CARD"] }, player: { teamId: team.id } },
      _count: { playerId: true },
    }),
    prisma.match.findMany({
      where: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
    }),
  ]);

  const teamStanding = standings.find((row) => row.teamId === team.id) ?? null;
  const teamRank = standings.findIndex((row) => row.teamId === team.id) + 1;

  const hdrs = await headers();
  const publicTeamUrl = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host") ?? "league-manager-app.vercel.app"}/leagues/${team.leagueId}/teams/${team.id}`;
  const appsByPlayer = new Map(appsGrouped.map((g) => [g.playerId, g._count.playerId]));
  const goalsByPlayer = new Map<string, number>();
  const yellowsByPlayer = new Map<string, number>();
  for (const g of eventsGrouped) {
    if (!g.playerId) continue;
    if (g.type === "GOAL") goalsByPlayer.set(g.playerId, g._count.playerId);
    if (g.type === "YELLOW_CARD") yellowsByPlayer.set(g.playerId, g._count.playerId);
  }
  const myTopScorers = team.players
    .map((p) => ({ name: p.name, goals: goalsByPlayer.get(p.id) ?? 0 }))
    .filter((p) => p.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 3);
  let rankDelta = 0;
  const lastFinRound = teamMatches
    .filter((m) => m.status === "FINISHED" && m.stage === "LEAGUE")
    .reduce((max, m) => Math.max(max, m.round), 0);
  if (lastFinRound >= 2) {
    const prev = await computeStandingsUpTo(team.leagueId, lastFinRound);
    const prevIdx = prev.findIndex((r) => r.teamId === team.id);
    if (prevIdx >= 0 && teamRank > 0) rankDelta = prevIdx - (teamRank - 1);
  }

  const filteredPlayers = team.players.filter((p) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "OUT") return p.status !== "ACTIVE";
    return p.status === statusFilter;
  });
  if (sortByGoals) {
    filteredPlayers.sort(
      (a, b) => (goalsByPlayer.get(b.id) ?? 0) - (goalsByPlayer.get(a.id) ?? 0)
    );
  } else if (sortByApps) {
    filteredPlayers.sort(
      (a, b) => (appsByPlayer.get(b.id) ?? 0) - (appsByPlayer.get(a.id) ?? 0)
    );
  }

  const selectedPlayerIds = new Set(nextMatch?.lineups.map((l) => l.playerId) ?? []);
  const eligiblePlayers = team.players.filter((p) => p.status === "ACTIVE");
  const addPlayerWithId = addPlayer.bind(null, team.id);
  const setLineupWithId = nextMatch ? setLineup.bind(null, nextMatch.id) : null;
  const daysUntilNextMatch = nextMatch
    ? Math.ceil((nextMatch.kickoffAt.getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display font-bold text-3xl">{team.name}</h1>
        <p className="text-foreground/60 mt-1">จัดการนักเตะและตัวจริงของทีมคุณ</p>
      </div>

      <div className="rounded-lg bg-card border border-white/10 p-5">
        <h2 className="font-semibold mb-3">ข้อมูลทีม</h2>
        <form
          action={updateMyTeam.bind(null, team.id)}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            name="name"
            defaultValue={team.name}
            required
            className="flex-1 min-w-[10rem] rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="abbr"
            defaultValue={team.abbr}
            required
            maxLength={4}
            className="w-20 rounded-md bg-black/30 border border-white/10 px-2 py-2 text-sm text-center outline-none focus:border-accent"
          />
          <input
            type="color"
            name="color"
            defaultValue={team.color}
            className="h-9 w-9 rounded-md bg-black/30 border border-white/10"
          />
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            className="text-xs text-foreground/50 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
          />
          <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
            บันทึก
          </button>
        </form>
      </div>

      {teamStanding && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">
            ฟอร์มทีม
            {teamRank > 0 && (
              <span className="ml-2 text-sm text-foreground/60">
                · อันดับ {teamRank}
                {rankDelta > 0 && <span className="text-accent ml-1">▲{rankDelta}</span>}
                {rankDelta < 0 && <span className="text-red-400 ml-1">▼{-rankDelta}</span>}
                {(() => {
                  const above = standings[teamRank - 2];
                  const below = standings[teamRank];
                  return (
                    <span className="text-xs text-foreground/45 ml-2">
                      {above && <>ตามอันดับบน {above.points - teamStanding.points} แต้ม</>}
                      {above && below && " · "}
                      {below && <>นำอันดับล่าง {teamStanding.points - below.points} แต้ม</>}
                    </span>
                  );
                })()}
              </span>
            )}
          </h2>
          <div className="flex flex-wrap gap-6 text-sm mb-3">
            <div>
              <div className="font-display font-extrabold text-xl text-accent">
                {teamStanding.played}
              </div>
              <div className="text-xs text-foreground/55">ลงแข่ง</div>
            </div>
            <div>
              <div className="font-display font-extrabold text-xl text-accent">
                {teamStanding.goalsFor}-{teamStanding.goalsAgainst}
              </div>
              <div className="text-xs text-foreground/55">ได้-เสีย</div>
            </div>
            <div>
              <div className="font-display font-extrabold text-xl text-accent">{cleanSheets}</div>
              <div className="text-xs text-foreground/55">คลีนชีต</div>
            </div>
            <div>
              <div className="font-display font-extrabold text-xl text-accent">
                {teamStanding.points}
              </div>
              <div className="text-xs text-foreground/55">แต้ม</div>
            </div>
          </div>
          <div className="flex gap-1">
            {teamStanding.form.map((f, i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded text-xs font-bold grid place-items-center ${FORM_LABEL[f].className}`}
              >
                {FORM_LABEL[f].t}
              </span>
            ))}
          </div>
          {myTopScorers.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3 text-sm">
              <div className="text-xs text-foreground/50 mb-1.5">⚽ ดาวซัลโวของทีม</div>
              <div className="flex flex-wrap gap-4">
                {myTopScorers.map((s) => (
                  <span key={s.name}>
                    {s.name} <span className="text-accent font-display font-bold">{s.goals}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(() => {
        const ranked = team.players
          .map((p) => ({
            player: p,
            goals: goalsByPlayer.get(p.id) ?? 0,
            apps: appsByPlayer.get(p.id) ?? 0,
          }))
          .filter((r) => r.goals > 0 || r.apps > 0)
          .sort((a, b) => b.goals - a.goals || b.apps - a.apps);
        const star = ranked[0];
        if (!star || (star.goals === 0 && star.apps === 0)) return null;
        return (
          <Link
            href={`/leagues/${team.leagueId}/players/${star.player.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-lg border border-accent/30 bg-accent/10 px-5 py-4 hover:bg-accent/15"
          >
            <span className="text-3xl">🌟</span>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">ดาวเด่นของฤดูกาล</div>
              <div className="font-display font-bold text-lg truncate">
                #{star.player.number} {star.player.name}
              </div>
              <div className="text-sm text-foreground/70">
                {star.goals > 0 ? (
                  <>
                    <span className="text-accent font-semibold">{star.goals}</span> ประตู
                    {star.apps > 0 && ` จาก ${star.apps} นัด`}
                  </>
                ) : (
                  <>
                    ลงสนาม <span className="text-accent font-semibold">{star.apps}</span> นัด
                  </>
                )}
              </div>
            </div>
            <span className="ml-auto text-xs text-foreground/40 shrink-0">ดูโปรไฟล์ →</span>
          </Link>
        );
      })()}

      {(() => {
        const finishedLeague = teamMatches.filter(
          (m) => m.status === "FINISHED" && m.stage === "LEAGUE"
        );
        if (finishedLeague.length === 0) return null;
        const split = (isHomeSide: boolean) => {
          const rows = finishedLeague.filter((m) =>
            isHomeSide ? m.homeTeamId === team.id : m.awayTeamId === team.id
          );
          let w = 0,
            d = 0,
            l = 0,
            gf = 0,
            ga = 0;
          for (const m of rows) {
            const my = m.homeTeamId === team.id ? m.homeScore : m.awayScore;
            const opp = m.homeTeamId === team.id ? m.awayScore : m.homeScore;
            gf += my;
            ga += opp;
            if (my > opp) w++;
            else if (my < opp) l++;
            else d++;
          }
          const pts = w * 3 + d;
          return { count: rows.length, w, d, l, gf, ga, pts };
        };
        const home = split(true);
        const away = split(false);
        const Row = ({ label, s }: { label: string; s: ReturnType<typeof split> }) =>
          s.count === 0 ? null : (
            <div className="flex items-center gap-3">
              <span className="w-14 text-xs text-foreground/55">{label}</span>
              <span className="text-sm">
                <b className="text-accent">{s.w}</b> ช · <b>{s.d}</b> ส ·{" "}
                <b className="text-red-400">{s.l}</b> พ
              </span>
              <span className="text-xs text-foreground/50">
                ยิง {s.gf} เสีย {s.ga}
              </span>
              <span className="ml-auto text-xs text-foreground/45">
                {s.pts} แต้ม · เฉลี่ย{" "}
                <span className="text-foreground/70">{(s.pts / s.count).toFixed(2)}</span>/นัด
              </span>
            </div>
          );
        return (
          <div className="rounded-lg bg-card border border-white/10 p-5">
            <h2 className="font-semibold mb-3">สถิติเหย้า - เยือน</h2>
            <div className="space-y-2">
              <Row label="🏠 เหย้า" s={home} />
              <Row label="✈ เยือน" s={away} />
            </div>
            {home.count > 0 && away.count > 0 && (
              <p className="mt-3 text-xs text-foreground/45">
                {home.pts / home.count >= away.pts / away.count
                  ? "ทีมทำแต้มเฉลี่ยได้ดีกว่าเมื่อเล่นในบ้าน"
                  : "ทีมทำแต้มเฉลี่ยได้ดีกว่าเมื่อเล่นนอกบ้าน"}
              </p>
            )}
          </div>
        );
      })()}

      {(() => {
        const finishedLeague = teamMatches
          .filter((m) => m.status === "FINISHED" && m.stage === "LEAGUE")
          .sort((a, b) => a.round - b.round || a.kickoffAt.getTime() - b.kickoffAt.getTime());
        if (finishedLeague.length === 0) return null;
        const results = finishedLeague.map((m) => {
          const gf = m.homeTeamId === team.id ? m.homeScore : m.awayScore;
          const ga = m.homeTeamId === team.id ? m.awayScore : m.homeScore;
          return gf > ga ? "W" : gf < ga ? "L" : "D";
        });
        const last = results[results.length - 1];
        let run = 0;
        for (let i = results.length - 1; i >= 0 && results[i] === last; i--) run++;
        let unbeaten = 0;
        for (let i = results.length - 1; i >= 0 && results[i] !== "L"; i--) unbeaten++;
        const streakLabel =
          last === "W" ? "ชนะรวด" : last === "L" ? "แพ้รวด" : "เสมอรวด";
        const streakClass =
          last === "W"
            ? "border-accent/40 bg-accent/10 text-accent"
            : last === "L"
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-white/15 bg-white/5 text-foreground/70";
        return (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full border px-3 py-1 font-semibold ${streakClass}`}>
              {run >= 2 ? `🔥 ${streakLabel} ${run} นัด` : `นัดล่าสุด: ${last === "W" ? "ชนะ" : last === "L" ? "แพ้" : "เสมอ"}`}
            </span>
            {unbeaten >= 3 && last !== "W" && (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-foreground/70">
                ไม่แพ้ติดต่อกัน {unbeaten} นัด
              </span>
            )}
          </div>
        );
      })()}

      {(() => {
        const finishedLeague = teamMatches.filter(
          (m) => m.status === "FINISHED" && m.stage === "LEAGUE"
        );
        if (finishedLeague.length === 0) return null;
        type Rec = { m: (typeof finishedLeague)[number]; gf: number; ga: number; diff: number };
        const rows: Rec[] = finishedLeague.map((m) => {
          const gf = m.homeTeamId === team.id ? m.homeScore : m.awayScore;
          const ga = m.homeTeamId === team.id ? m.awayScore : m.homeScore;
          return { m, gf, ga, diff: gf - ga };
        });
        const bestWin = rows
          .filter((r) => r.diff > 0)
          .sort((a, b) => b.diff - a.diff || b.gf - a.gf)[0];
        const worstLoss = rows
          .filter((r) => r.diff < 0)
          .sort((a, b) => a.diff - b.diff || b.ga - a.ga)[0];
        const opp = (r: Rec) =>
          r.m.homeTeamId === team.id ? r.m.awayTeam.name : r.m.homeTeam.name;
        if (!bestWin && !worstLoss) return null;
        return (
          <div className="rounded-lg bg-card border border-white/10 p-5">
            <h2 className="font-semibold mb-3">สถิติเด่นของฤดูกาล</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {bestWin && (
                <Link
                  href={`/matches/${bestWin.m.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-white/5 px-3 py-2.5 hover:bg-white/10"
                >
                  <div className="text-xs text-foreground/50 mb-0.5">🏆 ชนะขาดที่สุด</div>
                  <div>
                    พบ {opp(bestWin)}{" "}
                    <span className="font-display font-bold text-accent">
                      {bestWin.gf}-{bestWin.ga}
                    </span>
                  </div>
                </Link>
              )}
              {worstLoss && (
                <Link
                  href={`/matches/${worstLoss.m.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-white/5 px-3 py-2.5 hover:bg-white/10"
                >
                  <div className="text-xs text-foreground/50 mb-0.5">💔 แพ้ยับที่สุด</div>
                  <div>
                    พบ {opp(worstLoss)}{" "}
                    <span className="font-display font-bold text-red-400">
                      {worstLoss.gf}-{worstLoss.ga}
                    </span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        );
      })()}

      {teamMatches.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">โปรแกรมและผลของทีม</h2>
            <span className="flex items-center gap-3">
              <a
                href={`/leagues/${team.leagueId}/calendar?team=${team.id}`}
                className="text-xs text-foreground/60 hover:text-accent"
              >
                📅 ปฏิทิน (.ics)
              </a>
              <a href="/teams/mine/export" className="text-xs text-foreground/60 hover:text-accent">
                ⬇ รายชื่อ CSV
              </a>
              <ShareLinks url={publicTeamUrl} text={team.name} />
            </span>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {teamMatches.map((m) => {
              const finished = m.status === "FINISHED";
              const isHome = m.homeTeamId === team.id;
              const gf = isHome ? m.homeScore : m.awayScore;
              const ga = isHome ? m.awayScore : m.homeScore;
              const res = !finished ? null : gf > ga ? "ช" : gf < ga ? "พ" : "ส";
              const resClass =
                res === "ช"
                  ? "bg-accent text-black"
                  : res === "พ"
                    ? "bg-red-500 text-white"
                    : "bg-white/15 text-foreground";
              return (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid grid-cols-[28px_1fr_64px_1fr] items-center gap-2 rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                >
                  <span className="text-xs text-foreground/40">{m.round}</span>
                  <span className="truncate text-right">{m.homeTeam.name}</span>
                  <span className="text-center">
                    {finished || m.status === "LIVE" ? (
                      <span className="font-display font-bold">
                        {m.homeScore}-{m.awayScore}
                      </span>
                    ) : (
                      <span className="text-xs text-foreground/50">
                        {m.kickoffAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{m.awayTeam.name}</span>
                    {res && (
                      <span
                        className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center shrink-0 ${resClass}`}
                      >
                        {res}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {nextMatch && setLineupWithId && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">เลือกตัวจริงนัดถัดไป</h2>
            {daysUntilNextMatch !== null && (
              <span className="text-xs font-semibold rounded-full px-3 py-1 border border-yellow-400/40 bg-yellow-400/10 text-yellow-400">
                {daysUntilNextMatch > 0 ? `เหลือ ${daysUntilNextMatch} วัน` : "ถึงกำหนดแล้ว"}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground/60 mb-1">
            {nextMatch.homeTeam.name} vs {nextMatch.awayTeam.name} ·{" "}
            {nextMatch.kickoffAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
            {nextMatch.venue && <> · {nextMatch.venue}</>}
          </p>
          {(() => {
            const oppId =
              nextMatch.homeTeamId === team.id ? nextMatch.awayTeamId : nextMatch.homeTeamId;
            const prev = teamMatches.filter(
              (m) =>
                m.status === "FINISHED" &&
                (m.homeTeamId === oppId || m.awayTeamId === oppId)
            );
            if (prev.length === 0) return <div className="mb-3" />;
            let w = 0,
              d = 0,
              l = 0;
            for (const m of prev) {
              const gf = m.homeTeamId === team.id ? m.homeScore : m.awayScore;
              const ga = m.homeTeamId === team.id ? m.awayScore : m.homeScore;
              if (gf > ga) w++;
              else if (gf < ga) l++;
              else d++;
            }
            return (
              <p className="text-xs text-foreground/45 mb-4">
                สถิติเจอคู่นี้: ชนะ <b className="text-accent">{w}</b> เสมอ <b>{d}</b> แพ้{" "}
                <b className="text-red-400">{l}</b>
              </p>
            );
          })()}
          <form action={setLineupWithId} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {eligiblePlayers.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="playerId"
                    value={p.id}
                    defaultChecked={selectedPlayerIds.has(p.id)}
                  />
                  #{p.number} {p.name}
                  <input
                    type="number"
                    name={`shirt_${p.id}`}
                    placeholder="เบอร์"
                    title="เบอร์เสื้อเฉพาะนัดนี้ (ไม่ใส่ = เบอร์เดิม)"
                    defaultValue={
                      nextMatch?.lineups.find((l) => l.playerId === p.id)?.shirtNumber ?? ""
                    }
                    className="w-12 rounded bg-black/30 border border-white/10 px-1 py-0.5 text-[10px]"
                  />
                </label>
              ))}
              {eligiblePlayers.length === 0 && (
                <p className="text-sm text-foreground/50 col-span-2">ไม่มีนักเตะที่พร้อมลงเล่น</p>
              )}
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.round((selectedPlayerIds.size / LINEUP_SIZE) * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-foreground/50">
              เลือกแล้ว {selectedPlayerIds.size}/{LINEUP_SIZE}
            </p>
            <button type="submit" className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm">
              บันทึกตัวจริง
            </button>
          </form>
          <div className="mt-2 flex items-center gap-4">
            <form action={copyLastLineup.bind(null, nextMatch.id)}>
              <button type="submit" className="text-xs text-foreground/60 hover:text-accent">
                📋 คัดลอกรายชื่อจากนัดที่แล้ว
              </button>
            </form>
            {selectedPlayerIds.size > 0 && (
              <form action={clearLineup.bind(null, nextMatch.id)}>
                <button type="submit" className="text-xs text-foreground/40 hover:text-red-400">
                  🗑 ล้างรายชื่อทั้งหมด
                </button>
              </form>
            )}
          </div>
          {selectedPlayerIds.size > 0 && (
            <p className="mt-2 text-xs text-foreground/45">
              ที่เลือกไว้:{" "}
              {(["GK", "DF", "MF", "FW"] as const)
                .map((g) => {
                  const count = team.players.filter((p) => {
                    if (!selectedPlayerIds.has(p.id)) return false;
                    const pos = p.position.toUpperCase();
                    if (g === "GK") return pos.includes("GK") || p.position.includes("ผู้รักษา");
                    if (g === "DF") return pos.includes("DF") || p.position.includes("กองหลัง");
                    if (g === "FW")
                      return (
                        pos.includes("FW") ||
                        p.position.includes("กองหน้า") ||
                        p.position.includes("ปีก")
                      );
                    return (
                      !pos.includes("GK") &&
                      !pos.includes("DF") &&
                      !pos.includes("FW") &&
                      !p.position.includes("ผู้รักษา") &&
                      !p.position.includes("กองหลัง") &&
                      !p.position.includes("กองหน้า") &&
                      !p.position.includes("ปีก")
                    );
                  }).length;
                  return `${g} ${count}`;
                })
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      {(() => {
        const now = Date.now();
        const windowDays = 10;
        const horizon = now + windowDays * 86400000;
        const upcoming = teamMatches
          .filter(
            (m) =>
              m.status === "SCHEDULED" &&
              m.kickoffAt.getTime() >= now &&
              m.kickoffAt.getTime() <= horizon
          )
          .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
        if (upcoming.length < 2) return null;
        return (
          <div className="rounded-md bg-orange-400/10 border border-orange-400/30 px-4 py-3 text-sm text-orange-300">
            <div className="font-semibold">
              🗓 โปรแกรมแน่น: {upcoming.length} นัดภายใน {windowDays} วัน
            </div>
            <div className="mt-1.5 text-xs text-orange-200/80 flex flex-wrap gap-x-4 gap-y-1">
              {upcoming.map((m) => {
                const opp = m.homeTeamId === team.id ? m.awayTeam.name : m.homeTeam.name;
                const d = Math.ceil((m.kickoffAt.getTime() - now) / 86400000);
                return (
                  <span key={m.id}>
                    {m.homeTeamId === team.id ? "🏠" : "✈"} {opp}{" "}
                    <span className="text-orange-200/60">
                      ({d <= 0 ? "วันนี้" : `อีก ${d} วัน`})
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {(() => {
        if (!nextMatch) return null;
        const byPlayer = new Map(nextMatch.lineups.map((l) => [l.playerId, l.shirtNumber]));
        const effective = team.players
          .filter((p) => selectedPlayerIds.has(p.id))
          .map((p) => ({
            name: p.name,
            num: byPlayer.get(p.id) ?? p.number,
          }));
        const counts = new Map<number, string[]>();
        for (const e of effective) {
          counts.set(e.num, [...(counts.get(e.num) ?? []), e.name]);
        }
        const clashes = [...counts.entries()].filter(([, names]) => names.length > 1);
        if (clashes.length === 0) return null;
        return (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-300">
            <div className="font-semibold">⚠ เบอร์เสื้อซ้ำในตัวจริงนัดถัดไป</div>
            <div className="mt-1 text-xs text-red-200/80 space-y-0.5">
              {clashes.map(([num, names]) => (
                <div key={num}>
                  เบอร์ {num}: {names.join(", ")}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {(() => {
        const todayMatch = teamMatches.find(
          (m) =>
            m.status !== "FINISHED" &&
            m.kickoffAt.toDateString() === new Date().toDateString()
        );
        return todayMatch ? (
          <div className="rounded-md bg-accent/10 border border-accent/40 px-4 py-2.5 text-sm">
            🔥 <b>ทีมมีแข่งวันนี้!</b> {todayMatch.homeTeam.name} vs {todayMatch.awayTeam.name} ·{" "}
            {todayMatch.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
            {todayMatch.venue && <> · {todayMatch.venue}</>}
          </div>
        ) : null;
      })()}

      {(() => {
        const atRisk = team.players.filter(
          (p) => p.status === "ACTIVE" && (yellowsByPlayer.get(p.id) ?? 0) >= 3
        );
        return atRisk.length > 0 ? (
          <div className="rounded-md bg-yellow-400/10 border border-yellow-400/30 px-4 py-2 text-sm text-yellow-400">
            ⚠ ใบเหลืองสะสมเสี่ยงแบน:{" "}
            {atRisk.map((p) => `${p.name} (${yellowsByPlayer.get(p.id)})`).join(", ")}
          </div>
        ) : null;
      })()}

      {imported !== undefined && (
        <p className="rounded-md bg-accent/10 border border-accent/30 px-4 py-2 text-sm text-accent">
          นำเข้านักเตะ {imported} คน{Number(skipped) > 0 && ` · ข้าม ${skipped} แถว (ข้อมูลไม่ครบ/เบอร์ซ้ำ)`}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">รายชื่อนักเตะ</h2>
          <div className="flex gap-2">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={`/teams/mine?status=${f.value}${sort ? `&sort=${sort}` : ""}`}
                className={`rounded-full px-3 py-1 text-xs ${
                  statusFilter === f.value ? "bg-accent text-black" : "bg-white/5 text-foreground/60"
                }`}
              >
                {f.label}
              </Link>
            ))}
            <Link
              href={`/teams/mine?status=${statusFilter}${sortByGoals ? "" : "&sort=goals"}`}
              className={`rounded-full px-3 py-1 text-xs ${
                sortByGoals ? "bg-accent text-black" : "bg-white/5 text-foreground/60"
              }`}
            >
              ⚽ เรียงตามประตู
            </Link>
            <Link
              href={`/teams/mine?status=${statusFilter}${sortByApps ? "" : "&sort=apps"}`}
              className={`rounded-full px-3 py-1 text-xs ${
                sortByApps ? "bg-accent text-black" : "bg-white/5 text-foreground/60"
              }`}
            >
              🏃 เรียงตามลงสนาม
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 text-xs text-foreground/40">
          <span className="w-8">#</span>
          <span className="flex-1">ชื่อ</span>
          <span className="w-16">ตำแหน่ง</span>
          <span className="w-10 text-center">ลงสนาม</span>
          <span className="w-10 text-center">ประตู</span>
          <span className="w-12 text-center">ป/นัด</span>
          <span className="w-10 text-center">เหลือง</span>
        </div>

        <p className="px-4 pt-1 text-xs text-foreground/45">
          พร้อมลงเล่น {team.players.filter((p) => p.status === "ACTIVE").length} · บาดเจ็บ{" "}
          {team.players.filter((p) => p.status === "INJURED").length} · โดนแบน{" "}
          {team.players.filter((p) => p.status === "BANNED").length}
        </p>

        {(() => {
          const ages = team.players
            .filter((p) => p.birthYear)
            .map((p) => new Date().getFullYear() - (p.birthYear as number));
          const avgAge = ages.length
            ? (ages.reduce((sum, a) => sum + a, 0) / ages.length).toFixed(1)
            : null;
          const activeCount = team.players.filter((p) => p.status === "ACTIVE").length;
          const shortBy = LINEUP_SIZE - activeCount;
          return (
            <p className="px-4 pt-1 text-xs text-foreground/45">
              ผู้เล่นในทีม {team.players.length} คน
              {avgAge && (
                <>
                  {" "}
                  · อายุเฉลี่ย <span className="text-foreground/70">{avgAge}</span> ปี
                </>
              )}
              {shortBy > 0 && (
                <span className="text-red-400">
                  {" "}
                  · ⚠ ตัวพร้อมเล่นไม่พอจัดตัวจริง (ขาดอีก {shortBy} คน)
                </span>
              )}
            </p>
          );
        })()}

        <div className="space-y-2 mt-1">
          {filteredPlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-md bg-card border border-white/10 px-4 py-3 text-sm"
            >
              <form
                action={updatePlayerInfo.bind(null, p.id)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <input
                  name="number"
                  type="number"
                  min={1}
                  defaultValue={p.number}
                  className="w-14 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs"
                />
                <input
                  name="name"
                  defaultValue={p.name}
                  required
                  className="flex-1 min-w-20 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs"
                />
                <input
                  name="position"
                  defaultValue={p.position}
                  required
                  className="w-14 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs"
                />
                <input
                  type="file"
                  name="photo"
                  accept="image/png,image/jpeg,image/webp"
                  className="w-24 text-[10px] text-foreground/40 file:mr-1 file:rounded file:border-0 file:bg-white/10 file:px-1.5 file:py-0.5 file:text-[10px] file:text-foreground"
                />
                <button type="submit" className="text-xs text-foreground/50 hover:text-accent">
                  บันทึก
                </button>
              </form>
              {p.birthYear && (
                <span className="text-[10px] text-foreground/40 shrink-0">
                  {new Date().getFullYear() - p.birthYear} ปี
                </span>
              )}
              <span className="w-10 text-center text-foreground/70">{appsByPlayer.get(p.id) ?? 0}</span>
              <span className="w-10 text-center text-accent">{goalsByPlayer.get(p.id) ?? 0}</span>
              <span className="w-12 text-center text-foreground/50">
                {(() => {
                  const apps = appsByPlayer.get(p.id) ?? 0;
                  const goals = goalsByPlayer.get(p.id) ?? 0;
                  return apps > 0 && goals > 0 ? (goals / apps).toFixed(2) : "-";
                })()}
              </span>
              <span className="w-10 text-center text-yellow-400">{yellowsByPlayer.get(p.id) ?? 0}</span>
              <form action={updatePlayerStatus.bind(null, p.id)} className="flex items-center gap-1">
                <select
                  name="status"
                  defaultValue={p.status}
                  className="rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs"
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-xs text-foreground/50 hover:text-accent">
                  บันทึก
                </button>
              </form>
              <form action={deletePlayer.bind(null, p.id)}>
                <button type="submit" className="text-xs text-foreground/50 hover:text-red-400">
                  ลบ
                </button>
              </form>
            </div>
          ))}
          {filteredPlayers.length === 0 && (
            <p className="text-foreground/50 text-sm">ไม่มีนักเตะในหมวดนี้</p>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-card border border-white/10 p-5 max-w-sm">
        <h2 className="font-semibold mb-2">นำเข้านักเตะเป็นชุด</h2>
        <p className="text-xs text-foreground/50 mb-3">
          บรรทัดละคน รูปแบบ: ชื่อ,เบอร์,ตำแหน่ง
        </p>
        <form action={importPlayers.bind(null, team.id)} className="space-y-3">
          <textarea
            name="bulk"
            required
            rows={5}
            placeholder={"สมชาย ใจดี,7,FW\nวีระ มั่นคง,4,DF"}
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm"
          >
            นำเข้ารายชื่อ
          </button>
        </form>
      </div>

      <div className="rounded-lg bg-card border border-white/10 p-5 max-w-sm">
        <h2 className="font-semibold mb-4">เพิ่มนักเตะ</h2>
        <form action={addPlayerWithId} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="name">
              ชื่อ
            </label>
            <input
              id="name"
              name="name"
              required
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="number">
              เบอร์เสื้อ
            </label>
            <input
              id="number"
              name="number"
              type="number"
              required
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="position">
              ตำแหน่ง
            </label>
            <input
              id="position"
              name="position"
              required
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="nickname">
                ชื่อเล่น
              </label>
              <input
                id="nickname"
                name="nickname"
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="birthYear">
                ปีเกิด (ค.ศ.)
              </label>
              <input
                id="birthYear"
                name="birthYear"
                type="number"
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="heightCm">
                ส่วนสูง (ซม.)
              </label>
              <input
                id="heightCm"
                name="heightCm"
                type="number"
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="weightKg">
                น้ำหนัก (กก.)
              </label>
              <input
                id="weightKg"
                name="weightKg"
                type="number"
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="photo">
              รูปนักเตะ (ไม่บังคับ)
            </label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-full text-xs text-foreground/50 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
            />
          </div>
          <button type="submit" className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm">
            เพิ่มนักเตะ
          </button>
        </form>
      </div>
    </div>
  );
}
