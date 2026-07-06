import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { createLeague, createAdmin, resetUserPassword, setUserActive } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "จัดตารางแล้ว",
  IN_PROGRESS: "กำลังแข่งขัน",
  FINISHED: "จบฤดูกาล",
};

function computeRoundProgress(matches: { round: number; status: string }[]) {
  if (matches.length === 0) return { totalRounds: 0, currentRound: 0 };
  const totalRounds = Math.max(...matches.map((m) => m.round));
  let completedRounds = 0;
  for (let r = 1; r <= totalRounds; r++) {
    const roundMatches = matches.filter((m) => m.round === r);
    if (roundMatches.length > 0 && roundMatches.every((m) => m.status === "FINISHED")) {
      completedRounds++;
    }
  }
  return { totalRounds, currentRound: Math.min(completedRounds + 1, totalRounds) };
}

export default async function DashboardPage() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const [leagues, todayMatches, attentionMatches, adminLogs, users, tomorrowMatches, totalEvents, totalGoals, cardEventsByMatch] = await Promise.all([
    prisma.league.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        teams: { select: { id: true } },
        matches: { select: { round: true, status: true, kickoffAt: true, id: true, stage: true } },
      },
    }),
    prisma.match.findMany({
      where: { kickoffAt: { gte: startOfDay, lt: endOfDay } },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
        events: { where: { type: "KICK_OFF" } },
      },
      orderBy: { kickoffAt: "asc" },
    }),
    prisma.match.findMany({
      where: {
        OR: [{ status: "LIVE" }, { status: "SCHEDULED", kickoffAt: { lt: now } }],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
        events: { where: { type: "KICK_OFF" } },
      },
      orderBy: { kickoffAt: "asc" },
      take: 8,
    }),
    prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.user.findMany({
      include: { managedTeams: { select: { name: true } } },
      orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.match.findMany({
      where: {
        kickoffAt: { gte: endOfDay, lt: new Date(endOfDay.getTime() + 86400000) },
      },
      include: { homeTeam: true, awayTeam: true, league: true },
      orderBy: { kickoffAt: "asc" },
    }),
    prisma.matchEvent.count(),
    prisma.matchEvent.count({ where: { type: { in: ["GOAL", "OWN_GOAL"] } } }),
    prisma.matchEvent.groupBy({
      by: ["matchId"],
      where: { type: { in: ["YELLOW_CARD", "RED_CARD"] } },
      _count: { _all: true },
    }),
  ]);

  const tasks = [
    ...leagues
      .filter((lg) => lg.status === "DRAFT" && lg.teams.length === 0)
      .map((lg) => ({
        key: `noteams-${lg.id}`,
        label: `เพิ่มทีมให้ ${lg.name}`,
        href: `/admin/leagues/${lg.id}/teams`,
      })),
    ...leagues
      .filter((lg) => lg.status === "DRAFT" && lg.teams.length >= 2)
      .map((lg) => ({
        key: `schedule-${lg.id}`,
        label: `สร้างตารางแข่งขัน ${lg.name}`,
        href: `/admin/leagues/${lg.id}`,
      })),
    ...attentionMatches.map((m) => ({
      key: `match-${m.id}`,
      label:
        m.status === "LIVE"
          ? `บันทึกผล ${m.homeTeam.name} vs ${m.awayTeam.name} (สด ${m.events[0] ? computeLiveMinute(m.events[0].createdAt) : 0}')`
          : `เริ่มการแข่งขัน ${m.homeTeam.name} vs ${m.awayTeam.name}`,
      href: `/admin/matches/${m.id}`,
    })),
  ].slice(0, 6);

  const allMatches = leagues.flatMap((lg) => lg.matches);
  const totalMatches = allMatches.length;
  const finishedMatches = allMatches.filter((m) => m.status === "FINISHED").length;
  const seasonPct = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const sevenDaysAhead = new Date(now.getTime() + 7 * 86400000);
  const playedThisWeek = allMatches.filter(
    (m) => m.status === "FINISHED" && m.kickoffAt >= sevenDaysAgo && m.kickoffAt <= now
  ).length;
  const upcomingThisWeek = allMatches.filter(
    (m) => m.status === "SCHEDULED" && m.kickoffAt >= now && m.kickoffAt <= sevenDaysAhead
  ).length;

  const dormantManagers = users.filter(
    (u) =>
      u.role === "TEAM_MANAGER" &&
      u.isActive &&
      (!u.lastLoginAt || u.lastLoginAt < new Date(now.getTime() - 30 * 86400000))
  ).length;

  const goalsPerMatch =
    finishedMatches > 0 ? (totalGoals / finishedMatches).toFixed(2) : "0.00";

  const openRegLeagues = leagues.filter((lg) => lg.registrationOpen && !lg.hidden);

  const avgMatchesPerLeague =
    leagues.length > 0 ? Math.round(totalMatches / leagues.length) : 0;

  // Leagues whose LEAGUE stage is fully played but no playoff match exists yet.
  const playoffReadyLeagues = leagues.filter((lg) => {
    if (lg.status !== "IN_PROGRESS") return false;
    const leagueMatches = lg.matches.filter((m) => m.stage === "LEAGUE");
    if (leagueMatches.length === 0) return false;
    const allPlayed = leagueMatches.every((m) => m.status === "FINISHED");
    const hasPlayoff = lg.matches.some((m) => m.stage !== "LEAGUE");
    return allPlayed && !hasPlayoff;
  });

  // Most-carded league: sum YELLOW_CARD + RED_CARD events per league via matchId map.
  const matchLeagueMap = new Map<string, string>();
  for (const lg of leagues) {
    for (const m of lg.matches) matchLeagueMap.set(m.id, lg.id);
  }
  const cardsByLeague = new Map<string, number>();
  for (const row of cardEventsByMatch) {
    const leagueId = matchLeagueMap.get(row.matchId);
    if (!leagueId) continue;
    cardsByLeague.set(leagueId, (cardsByLeague.get(leagueId) ?? 0) + row._count._all);
  }
  const mostCardedLeague = (() => {
    let bestId: string | null = null;
    let bestCount = 0;
    for (const [leagueId, count] of cardsByLeague) {
      if (count > bestCount) {
        bestId = leagueId;
        bestCount = count;
      }
    }
    if (!bestId) return null;
    const lg = leagues.find((l) => l.id === bestId);
    return lg ? { league: lg, count: bestCount } : null;
  })();

  const busiestDay = (() => {
    const buckets = new Map<string, number>();
    for (const m of allMatches) {
      if (m.status !== "SCHEDULED" || m.kickoffAt < now || m.kickoffAt > sevenDaysAhead) continue;
      const d = new Date(
        m.kickoffAt.getFullYear(),
        m.kickoffAt.getMonth(),
        m.kickoffAt.getDate()
      );
      const key = d.toISOString();
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let bestKey: string | null = null;
    let bestCount = 0;
    for (const [key, count] of buckets) {
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }
    return bestKey ? { date: new Date(bestKey), count: bestCount } : null;
  })();

  // Feature: overdue matches (SCHEDULED but kickoff already passed) grouped by league.
  const overdueByLeague = leagues
    .map((lg) => ({
      league: lg,
      count: lg.matches.filter(
        (m) => m.status === "SCHEDULED" && m.kickoffAt < now
      ).length,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalOverdue = overdueByLeague.reduce((sum, row) => sum + row.count, 0);

  // Feature: most recently active team manager (last login).
  const topManager = users
    .filter((u) => u.role === "TEAM_MANAGER" && u.isActive && u.lastLoginAt)
    .sort((a, b) => (b.lastLoginAt!.getTime() - a.lastLoginAt!.getTime()))[0];

  // Feature: this-week vs last-week match volume (finished matches).
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
  const playedLastWeek = allMatches.filter(
    (m) =>
      m.status === "FINISHED" &&
      m.kickoffAt >= fourteenDaysAgo &&
      m.kickoffAt < sevenDaysAgo
  ).length;
  const weekDelta = playedThisWeek - playedLastWeek;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-display font-bold text-3xl">ภาพรวมลีก</h1>
        <p className="text-foreground/60 mt-1">จัดการลีกฟุตบอลทั้งหมดของคุณ</p>
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg bg-card border border-white/10 p-5 text-sm">
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">{leagues.length}</div>
          <div className="text-xs text-foreground/55">ลีกทั้งหมด</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">
            {leagues.reduce((sum, lg) => sum + lg.teams.length, 0)}
          </div>
          <div className="text-xs text-foreground/55">ทีม</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">
            {todayMatches.length}
          </div>
          <div className="text-xs text-foreground/55">แมตช์วันนี้</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">
            {attentionMatches.filter((m) => m.status === "LIVE").length}
          </div>
          <div className="text-xs text-foreground/55">กำลังแข่งสด</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">{users.length}</div>
          <div className="text-xs text-foreground/55">ผู้ใช้ระบบ</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">
            {totalEvents.toLocaleString()}
          </div>
          <div className="text-xs text-foreground/55">อีเวนต์ที่บันทึก</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">{goalsPerMatch}</div>
          <div className="text-xs text-foreground/55">ประตูเฉลี่ย/นัด</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">
            {avgMatchesPerLeague}
          </div>
          <div className="text-xs text-foreground/55">นัดเฉลี่ย/ลีก</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">{playedThisWeek}</div>
          <div className="text-xs text-foreground/55">แข่งใน 7 วันที่ผ่านมา</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-2xl text-accent">{upcomingThisWeek}</div>
          <div className="text-xs text-foreground/55">นัดใน 7 วันข้างหน้า</div>
        </div>
      </div>

      {totalMatches > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3 flex items-center justify-between">
            ความคืบหน้าฤดูกาลรวม
            <span className="text-xs text-foreground/50">
              {finishedMatches}/{totalMatches} นัดจบแล้ว · {seasonPct}%
            </span>
          </h2>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${seasonPct}%` }}
            />
          </div>
        </div>
      )}

      {busiestDay !== null && busiestDay.count > 1 && (
        <div className="rounded-lg bg-card border border-white/10 p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">วันที่แข่งหนาแน่นที่สุด (7 วันข้างหน้า)</h2>
            <p className="text-sm text-foreground/55 mt-1">
              {busiestDay.date.toLocaleDateString("th-TH", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
          <span className="rounded-full bg-accent/15 text-accent px-3 py-1 text-sm font-semibold shrink-0">
            {busiestDay.count} นัด
          </span>
        </div>
      )}

      {(playedThisWeek > 0 || playedLastWeek > 0) && (
        <div className="rounded-lg bg-card border border-white/10 p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">โมเมนตัมการแข่ง (สัปดาห์นี้ vs สัปดาห์ก่อน)</h2>
            <p className="text-sm text-foreground/55 mt-1">
              สัปดาห์นี้ {playedThisWeek} นัด · สัปดาห์ก่อน {playedLastWeek} นัด
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold shrink-0 ${
              weekDelta > 0
                ? "bg-emerald-400/15 text-emerald-400"
                : weekDelta < 0
                  ? "bg-red-500/15 text-red-400"
                  : "bg-white/5 text-foreground/60"
            }`}
          >
            {weekDelta > 0 ? "▲" : weekDelta < 0 ? "▼" : "="} {weekDelta > 0 ? "+" : ""}
            {weekDelta}
          </span>
        </div>
      )}

      {topManager && (
        <div className="rounded-lg bg-card border border-white/10 p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">ผู้จัดการทีมที่แอ็กทีฟล่าสุด</h2>
            <p className="text-sm text-foreground/55 mt-1">
              {topManager.name}
              {topManager.managedTeams[0] && (
                <span className="text-foreground/45"> · {topManager.managedTeams[0].name}</span>
              )}
            </p>
          </div>
          <span className="rounded-full bg-accent/15 text-accent px-3 py-1 text-sm font-semibold shrink-0">
            ⭐ ล็อกอิน{" "}
            {topManager.lastLoginAt!.toLocaleDateString("th-TH", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
      )}

      {totalOverdue > 0 && (
        <div className="rounded-lg bg-card border border-red-500/20 p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            แมตช์เกินกำหนดยังไม่เริ่ม
            <span className="rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-[10px]">
              {totalOverdue} นัด
            </span>
          </h2>
          <p className="text-xs text-foreground/50 mb-3">
            แมตช์เหล่านี้ผ่านเวลาแข่งแล้วแต่ยังอยู่สถานะ &quot;จัดตารางแล้ว&quot; ควรเริ่มหรือเลื่อนเวลา
          </p>
          <div className="space-y-2">
            {overdueByLeague.map((row) => (
              <Link
                key={row.league.id}
                href={`/admin/leagues/${row.league.id}`}
                className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <span>{row.league.name}</span>
                <span className="text-red-400">{row.count} นัดค้าง →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {openRegLeagues.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            เปิดรับสมัครทีมอยู่
            <span className="rounded-full bg-emerald-400/10 text-emerald-400 px-2 py-0.5 text-[10px]">
              {openRegLeagues.length} ลีก
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {openRegLeagues.map((lg) => (
              <Link
                key={lg.id}
                href={`/admin/leagues/${lg.id}/teams`}
                className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                {lg.name} <span className="text-foreground/45">· {lg.teams.length} ทีม</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {playoffReadyLeagues.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            พร้อมเข้าสู่รอบเพลย์ออฟ
            <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[10px]">
              {playoffReadyLeagues.length} ลีก
            </span>
          </h2>
          <p className="text-xs text-foreground/50 mb-3">
            รอบลีกจบครบทุกนัดแล้ว แต่ยังไม่ได้สร้างรอบรองฯ/รอบชิง
          </p>
          <div className="space-y-2">
            {playoffReadyLeagues.map((lg) => (
              <Link
                key={lg.id}
                href={`/admin/leagues/${lg.id}`}
                className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <span>
                  🏅 {lg.name}{" "}
                  <span className="text-foreground/45">· ฤดูกาล {lg.seasonYear}</span>
                </span>
                <span className="text-accent">สร้างรอบเพลย์ออฟ →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {mostCardedLeague !== null && mostCardedLeague.count > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">ลีกใบเหลือง-แดงมากที่สุด</h2>
            <Link
              href={`/leagues/${mostCardedLeague.league.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline mt-1 inline-block"
            >
              {mostCardedLeague.league.name} →
            </Link>
          </div>
          <span className="rounded-full bg-red-500/15 text-red-400 px-3 py-1 text-sm font-semibold shrink-0">
            🟨🟥 {mostCardedLeague.count} ใบ
          </span>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">
            งานที่รอดำเนินการ{" "}
            <span className="ml-1 rounded-full bg-accent/15 text-accent px-2 py-0.5 text-xs">
              {tasks.length}
            </span>
          </h2>
          <div className="space-y-2">
            {tasks.map((task) => (
              <Link
                key={task.key}
                href={task.href}
                className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <span>{task.label}</span>
                <span className="text-accent">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {todayMatches.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3 flex items-center justify-between">
            แมตช์วันนี้
            <Link href="/admin/today" className="text-xs text-accent hover:underline">
              ดูบอร์ดรวมทุกลีก →
            </Link>
          </h2>
          <div className="space-y-2">
            {todayMatches.map((m) => (
              <Link
                key={m.id}
                href={`/admin/matches/${m.id}`}
                className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <span className="text-foreground/50 text-xs">{m.league.name}</span>
                <span>
                  {m.homeTeam.name} {m.status !== "SCHEDULED" && `${m.homeScore}-${m.awayScore}`}{" "}
                  {m.awayTeam.name}
                </span>
                <span className="text-foreground/50 text-xs">
                  {m.status === "SCHEDULED"
                    ? m.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                    : m.status === "LIVE"
                      ? `สด ${m.events[0] ? computeLiveMinute(m.events[0].createdAt) : m.minute}'`
                      : "จบ"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tomorrowMatches.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">แมตช์พรุ่งนี้</h2>
          <div className="space-y-2">
            {tomorrowMatches.map((m) => (
              <Link
                key={m.id}
                href={`/admin/matches/${m.id}`}
                className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <span className="text-foreground/50 text-xs">{m.league.name}</span>
                <span>
                  {m.homeTeam.name} vs {m.awayTeam.name}
                </span>
                <span className="text-foreground/50 text-xs">
                  {m.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3">ลีกทั้งหมด</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {leagues.map((league) => {
            const { totalRounds, currentRound } = computeRoundProgress(league.matches);
            const pending = league.matches.filter((m) => m.status === "LIVE").length;
            const lastFinished = league.matches
              .filter((m) => m.status === "FINISHED")
              .reduce<Date | null>(
                (max, m) => (!max || m.kickoffAt > max ? m.kickoffAt : max),
                null
              );
            const quiet =
              league.status === "IN_PROGRESS" &&
              lastFinished !== null &&
              now.getTime() - lastFinished.getTime() > 14 * 86400000;
            return (
              <div
                key={league.id}
                className="rounded-lg bg-card border border-white/10 p-5 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{league.name}</p>
                    <p className="text-sm text-foreground/50">
                      ฤดูกาล {league.seasonYear} · {league.teams.length} ทีม
                    </p>
                  </div>
                  <span className="text-xs rounded-full bg-white/5 px-3 py-1 text-foreground/70 shrink-0">
                    {league.status === "FINISHED" ? "🏆 " : ""}
                    {STATUS_LABEL[league.status]}
                    {league.hidden && " · ซ่อนอยู่"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-foreground/60">
                  <span>
                    {totalRounds > 0 ? `นัดที่ ${currentRound}/${totalRounds}` : "ยังไม่มีตาราง"}
                  </span>
                  {pending > 0 && <span className="text-accent">● {pending} รอบันทึกผล</span>}
                  {quiet && (
                    <span className="rounded-full bg-yellow-400/10 text-yellow-400 px-2 py-0.5 text-[10px]">
                      💤 เงียบเกิน 14 วัน
                    </span>
                  )}
                  {(() => {
                    const nextKick = league.matches
                      .filter((m) => m.status === "SCHEDULED" && m.kickoffAt >= now)
                      .reduce<Date | null>(
                        (min, m) => (!min || m.kickoffAt < min ? m.kickoffAt : min),
                        null
                      );
                    return nextKick ? (
                      <span className="text-foreground/45">
                        ⏰ นัดต่อไป{" "}
                        {nextKick.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                      </span>
                    ) : null;
                  })()}
                </div>

                {totalRounds > 0 && (
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${Math.round((currentRound / totalRounds) * 100)}%` }}
                    />
                  </div>
                )}

                <div className="flex gap-3 text-sm">
                  <Link href={`/admin/leagues/${league.id}`} className="text-accent hover:underline">
                    จัดการ
                  </Link>
                  <Link
                    href={`/admin/leagues/${league.id}/teams`}
                    className="text-foreground/60 hover:text-accent"
                  >
                    ทีม
                  </Link>
                  <Link
                    href={`/leagues/${league.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground/60 hover:text-accent"
                  >
                    หน้าโปรโมต
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        {leagues.length === 0 && (
          <p className="text-foreground/50 text-sm">ยังไม่มีลีก สร้างลีกแรกของคุณด้านล่าง</p>
        )}
      </div>

      <div className="rounded-lg bg-card border border-white/10 p-5 space-y-4">
        <h2 className="font-semibold flex flex-wrap items-center gap-2">
          <span>
            ผู้ใช้ระบบ{" "}
            <span className="text-xs text-foreground/45">
              (แอดมิน {users.filter((u) => u.role === "SUPER_ADMIN").length} · ผู้จัดการทีม{" "}
              {users.filter((u) => u.role === "TEAM_MANAGER").length})
            </span>
          </span>
          {dormantManagers > 0 && (
            <span className="rounded-full bg-yellow-400/10 text-yellow-400 px-2 py-0.5 text-[10px]">
              💤 {dormantManagers} ผู้จัดการเงียบเกิน 30 วัน
            </span>
          )}
        </h2>
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-md bg-white/5 px-3 py-2 text-sm"
            >
              <div className="flex-1 min-w-40">
                <span className="font-semibold">{u.name}</span>{" "}
                <span className="text-foreground/50 text-xs">{u.email}</span>
              </div>
              <span className="text-xs rounded-full bg-white/10 px-2 py-0.5 text-foreground/60">
                {u.role === "SUPER_ADMIN"
                  ? "แอดมิน"
                  : `ผู้จัดการทีม${u.managedTeams[0] ? ` · ${u.managedTeams[0].name}` : ""}`}
              </span>
              <span className="text-[10px] text-foreground/40">
                {u.lastLoginAt
                  ? `ล็อกอินล่าสุด ${u.lastLoginAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`
                  : "ยังไม่เคยล็อกอิน"}
              </span>
              {!u.isActive && (
                <span className="text-[10px] rounded-full bg-red-500/15 text-red-400 px-2 py-0.5">
                  ระงับอยู่
                </span>
              )}
              <form action={setUserActive.bind(null, u.id, !u.isActive)}>
                <button
                  type="submit"
                  className={`text-xs ${u.isActive ? "text-foreground/40 hover:text-red-400" : "text-accent"}`}
                >
                  {u.isActive ? "ระงับ" : "เปิดใช้"}
                </button>
              </form>
              <form
                action={resetUserPassword.bind(null, u.id)}
                className="flex items-center gap-1"
              >
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="รหัสใหม่"
                  className="w-28 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs"
                />
                <button type="submit" className="text-xs text-foreground/50 hover:text-accent">
                  รีเซ็ต
                </button>
              </form>
            </div>
          ))}
        </div>
        <form action={createAdmin} className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-4">
          <input
            name="name"
            required
            placeholder="ชื่อแอดมินใหม่"
            className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="อีเมล"
            className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="รหัสผ่าน (8+)"
            className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-md bg-accent text-black font-semibold px-4 py-2 text-sm"
          >
            เพิ่มแอดมิน
          </button>
        </form>
      </div>

      {adminLogs.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">ประวัติการทำงานล่าสุด</h2>
          <div className="space-y-1.5">
            {adminLogs.map((log) => (
              <div key={log.id} className="flex items-baseline gap-3 text-sm">
                <span className="text-xs text-foreground/40 w-32 shrink-0">
                  {log.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="text-foreground/70 shrink-0">{log.userName}</span>
                <span className="text-accent shrink-0">{log.action}</span>
                <span className="text-foreground/50 truncate">{log.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-card border border-white/10 p-5 max-w-sm">
        <h2 className="font-semibold mb-4">สร้างลีกใหม่</h2>
        <form action={createLeague} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="name">
              ชื่อลีก
            </label>
            <input
              id="name"
              name="name"
              required
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="seasonYear">
              ฤดูกาล (ปี)
            </label>
            <input
              id="seasonYear"
              name="seasonYear"
              type="number"
              required
              defaultValue={2026}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="legs">
              รูปแบบพบกันหมด
            </label>
            <select
              id="legs"
              name="legs"
              defaultValue={1}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value={1}>เหย้า-เยือนครั้งเดียว</option>
              <option value={2}>เหย้า-เยือน 2 นัด</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm"
          >
            สร้างลีก
          </button>
        </form>
      </div>
    </div>
  );
}
