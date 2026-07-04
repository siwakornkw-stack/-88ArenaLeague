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
  const appsByPlayer = new Map(appsGrouped.map((g) => [g.playerId, g._count.playerId]));
  const goalsByPlayer = new Map<string, number>();
  const yellowsByPlayer = new Map<string, number>();
  for (const g of eventsGrouped) {
    if (!g.playerId) continue;
    if (g.type === "GOAL") goalsByPlayer.set(g.playerId, g._count.playerId);
    if (g.type === "YELLOW_CARD") yellowsByPlayer.set(g.playerId, g._count.playerId);
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

      {teamMatches.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">โปรแกรมและผลของทีม</h2>
            <span className="flex items-center gap-3">
              <a
                href={`/leagues/${team.leagueId}/calendar?team=${team.id}`}
                className="text-xs text-foreground/60 hover:text-accent"
              >
                📅 โหลดปฏิทินทีม (.ics)
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
          <p className="text-sm text-foreground/60 mb-4">
            {nextMatch.homeTeam.name} vs {nextMatch.awayTeam.name} ·{" "}
            {nextMatch.kickoffAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
            {nextMatch.venue && <> · {nextMatch.venue}</>}
          </p>
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
        </div>
      )}

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
                href={`/teams/mine?status=${f.value}${sortByGoals ? "&sort=goals" : ""}`}
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
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 text-xs text-foreground/40">
          <span className="w-8">#</span>
          <span className="flex-1">ชื่อ</span>
          <span className="w-16">ตำแหน่ง</span>
          <span className="w-10 text-center">ลงสนาม</span>
          <span className="w-10 text-center">ประตู</span>
          <span className="w-10 text-center">เหลือง</span>
        </div>

        <p className="px-4 pt-1 text-xs text-foreground/45">
          พร้อมลงเล่น {team.players.filter((p) => p.status === "ACTIVE").length} · บาดเจ็บ{" "}
          {team.players.filter((p) => p.status === "INJURED").length} · โดนแบน{" "}
          {team.players.filter((p) => p.status === "BANNED").length}
        </p>

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
              <span className="w-10 text-center text-foreground/70">{appsByPlayer.get(p.id) ?? 0}</span>
              <span className="w-10 text-center text-accent">{goalsByPlayer.get(p.id) ?? 0}</span>
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
