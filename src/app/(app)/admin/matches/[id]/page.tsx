import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { MatchTimeline } from "@/components/match-timeline";
import {
  kickOff,
  addGoal,
  addCard,
  addSubstitution,
  endMatch,
  updateStats,
  updateMatchInfo,
  updateMvp,
  halfTime,
  reopenMatch,
  deleteEvent,
  quickStat,
  updateEventMinute,
  swapSides,
  recordInjury,
  resetEvents,
} from "./actions";

const STAT_FIELDS = [
  { key: "Possession", label: "ครองบอล %" },
  { key: "Shots", label: "ยิงทั้งหมด" },
  { key: "ShotsOnTarget", label: "ยิงเข้ากรอบ" },
  { key: "Corners", label: "เตะมุม" },
  { key: "Fouls", label: "ฟาวล์" },
] as const;

export default async function MatchLivePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: { include: { players: true } },
      awayTeam: { include: { players: true } },
      events: {
        orderBy: [{ minute: "asc" }, { createdAt: "asc" }],
        include: { player: true, relatedPlayer: true },
      },
      lineups: { include: { player: true } },
    },
  });
  if (!match) notFound();

  const homeLineupPlayers = match.lineups
    .filter((l) => match.homeTeam.players.some((p) => p.id === l.playerId))
    .map((l) => l.player);
  const awayLineupPlayers = match.lineups
    .filter((l) => match.awayTeam.players.some((p) => p.id === l.playerId))
    .map((l) => l.player);

  const homePlayers = homeLineupPlayers.length > 0 ? homeLineupPlayers : match.homeTeam.players;
  const awayPlayers = awayLineupPlayers.length > 0 ? awayLineupPlayers : match.awayTeam.players;

  const kickOffEvent = match.events.find((e) => e.type === "KICK_OFF");
  const liveMinute =
    match.status === "LIVE" && kickOffEvent ? computeLiveMinute(kickOffEvent.createdAt) : match.minute;

  const siblings = await prisma.match.findMany({
    where: { leagueId: match.leagueId },
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    select: { id: true, status: true },
  });
  const idx = siblings.findIndex((m) => m.id === id);
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;
  const pendingNext =
    siblings.find((m, i) => i > idx && m.status !== "FINISHED") ??
    siblings.find((m) => m.id !== id && m.status !== "FINISHED") ??
    null;

  const kickOffWithId = kickOff.bind(null, id);
  const addGoalWithId = addGoal.bind(null, id);
  const addCardWithId = addCard.bind(null, id);
  const addSubWithId = addSubstitution.bind(null, id);
  const recordInjuryWithId = recordInjury.bind(null, id);
  const endMatchWithId = endMatch.bind(null, id);
  const updateStatsWithId = updateStats.bind(null, id);
  const updateMatchInfoWithId = updateMatchInfo.bind(null, id);
  const halfTimeWithId = halfTime.bind(null, id);
  const deleteEventWithId = deleteEvent.bind(null, id);
  const quickStatWithId = quickStat.bind(null, id);
  const updateEventMinuteWithId = updateEventMinute.bind(null, id);

  const h2h = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      id: { not: id },
      OR: [
        { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
        { homeTeamId: match.awayTeamId, awayTeamId: match.homeTeamId },
      ],
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "desc" },
    take: 3,
  });
  const hasHalfTime = match.events.some((e) => e.type === "HALF_TIME");
  const homeLineupCount = match.lineups.filter((l) =>
    match.homeTeam.players.some((p) => p.id === l.playerId)
  ).length;
  const awayLineupCount = match.lineups.length - homeLineupCount;

  const formOf = async (teamId: string) => {
    const last = await prisma.match.findMany({
      where: {
        status: "FINISHED",
        id: { not: id },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      orderBy: { kickoffAt: "desc" },
      take: 3,
    });
    return last.map((m) => {
      const gf = m.homeTeamId === teamId ? m.homeScore : m.awayScore;
      const ga = m.homeTeamId === teamId ? m.awayScore : m.homeScore;
      return gf > ga ? "ช" : gf < ga ? "พ" : "ส";
    });
  };
  const [homeRecentForm, awayRecentForm] = await Promise.all([
    formOf(match.homeTeamId),
    formOf(match.awayTeamId),
  ]);

  const unavailableOf = (players: { status: string; name: string }[]) => ({
    banned: players.filter((p) => p.status === "BANNED").map((p) => p.name),
    injured: players.filter((p) => p.status === "INJURED").map((p) => p.name),
  });
  const homeUnavailable = unavailableOf(match.homeTeam.players);
  const awayUnavailable = unavailableOf(match.awayTeam.players);
  const hasUnavailable =
    homeUnavailable.banned.length +
      homeUnavailable.injured.length +
      awayUnavailable.banned.length +
      awayUnavailable.injured.length >
    0;

  const subsUsed = {
    HOME: match.events.filter((e) => e.type === "SUBSTITUTION" && e.side === "HOME").length,
    AWAY: match.events.filter((e) => e.type === "SUBSTITUTION" && e.side === "AWAY").length,
  };
  const SUB_LIMIT = 5;

  const readiness =
    match.status === "SCHEDULED"
      ? [
          { label: "ตั้งค่าสนามแข่ง", done: !!match.venue },
          { label: "กำหนดผู้ตัดสิน", done: !!match.refereeName },
          { label: `ส่งรายชื่อ ${match.homeTeam.abbr}`, done: homeLineupCount > 0 },
          { label: `ส่งรายชื่อ ${match.awayTeam.abbr}`, done: awayLineupCount > 0 },
        ]
      : [];
  const readyCount = readiness.filter((r) => r.done).length;

  const eventCounts = {
    goals: match.events.filter((e) => e.type === "GOAL" || e.type === "OWN_GOAL").length,
    yellow: match.events.filter((e) => e.type === "YELLOW_CARD").length,
    red: match.events.filter((e) => e.type === "RED_CARD").length,
    subs: match.events.filter((e) => e.type === "SUBSTITUTION").length,
  };
  const loggedGoals = {
    HOME:
      match.events.filter(
        (e) =>
          (e.type === "GOAL" && e.side === "HOME") ||
          (e.type === "OWN_GOAL" && e.side === "AWAY")
      ).length,
    AWAY:
      match.events.filter(
        (e) =>
          (e.type === "GOAL" && e.side === "AWAY") ||
          (e.type === "OWN_GOAL" && e.side === "HOME")
      ).length,
  };
  const scoreMismatch =
    match.status !== "SCHEDULED" &&
    (loggedGoals.HOME !== match.homeScore || loggedGoals.AWAY !== match.awayScore);

  const goalEvents = match.events.filter(
    (e) => e.type === "GOAL" || e.type === "OWN_GOAL"
  );
  let runHome = 0;
  let runAway = 0;
  const scoreTimeline = goalEvents.map((e) => {
    const countsFor = e.type === "OWN_GOAL" ? (e.side === "HOME" ? "AWAY" : "HOME") : e.side;
    if (countsFor === "HOME") runHome += 1;
    else runAway += 1;
    return {
      id: e.id,
      minute: e.minute,
      side: countsFor as "HOME" | "AWAY",
      isOwn: e.type === "OWN_GOAL",
      scorer: e.player?.name ?? "ไม่ระบุ",
      home: runHome,
      away: runAway,
    };
  });

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between text-sm">
        {prevId ? (
          <Link href={`/admin/matches/${prevId}`} className="text-foreground/60 hover:text-accent">
            ← นัดก่อนหน้า
          </Link>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-3">
          <Link
            href={`/admin/leagues/${match.leagueId}`}
            className="text-foreground/60 hover:text-accent"
          >
            ตารางแข่ง
          </Link>
          <Link
            href={`/matches/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/60 hover:text-accent"
          >
            ดูหน้าสาธารณะ ↗
          </Link>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              match.status === "LIVE"
                ? "bg-red-500/15 text-red-400"
                : match.status === "FINISHED"
                  ? "bg-white/10 text-foreground/60"
                  : "bg-accent/15 text-accent"
            }`}
          >
            {match.status === "LIVE"
              ? "LIVE"
              : match.status === "FINISHED"
                ? "จบแล้ว"
                : "ยังไม่แข่ง"}
          </span>
        </span>
        {nextId ? (
          <Link href={`/admin/matches/${nextId}`} className="text-foreground/60 hover:text-accent">
            นัดถัดไป →
          </Link>
        ) : (
          <span />
        )}
      </div>

      {match.status === "FINISHED" && pendingNext && (
        <Link
          href={`/admin/matches/${pendingNext.id}`}
          className="block rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-accent hover:bg-accent/15"
        >
          ⏭ นัดถัดไปที่ต้องบันทึก →
        </Link>
      )}

      <div className="rounded-lg bg-card border border-white/10 p-6 space-y-2">
        <div className="flex items-center justify-between">
          <Link
            href={`/leagues/${match.leagueId}/teams/${match.homeTeamId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold flex-1 text-right hover:text-accent"
          >
            {match.homeTeam.name}
          </Link>
          <span className="font-display font-bold text-4xl px-6">
            {match.homeScore} - {match.awayScore}
          </span>
          <Link
            href={`/leagues/${match.leagueId}/teams/${match.awayTeamId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold flex-1 hover:text-accent"
          >
            {match.awayTeam.name}
          </Link>
        </div>
        {match.status === "LIVE" && (
          <p className="text-center text-xs text-accent">
            LIVE · {hasHalfTime ? "ครึ่งหลัง" : "ครึ่งแรก"} {liveMinute}&apos;
          </p>
        )}
        <p className="text-center text-xs text-foreground/40">
          รายชื่อส่งแล้ว: {match.homeTeam.name} {homeLineupCount} คน · {match.awayTeam.name}{" "}
          {awayLineupCount} คน
        </p>
        {hasUnavailable && (
          <p className="text-center text-[11px] text-amber-400/80">
            ⚠ ใช้งานไม่ได้:{" "}
            {[
              ...homeUnavailable.banned.map((n) => `🟥 ${n}`),
              ...homeUnavailable.injured.map((n) => `🚑 ${n}`),
              ...awayUnavailable.banned.map((n) => `🟥 ${n}`),
              ...awayUnavailable.injured.map((n) => `🚑 ${n}`),
            ].join(" · ")}
          </p>
        )}
        {(homeRecentForm.length > 0 || awayRecentForm.length > 0) && (
          <p className="text-center text-xs text-foreground/35">
            ฟอร์ม 3 นัด: {match.homeTeam.abbr} [{homeRecentForm.join(" ") || "-"}] ·{" "}
            {match.awayTeam.abbr} [{awayRecentForm.join(" ") || "-"}]
          </p>
        )}
      </div>

      {scoreMismatch && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          ⚠ สกอร์ไม่ตรงกับเหตุการณ์: กระดานคือ {match.homeScore}-{match.awayScore} แต่นับจากประตูที่บันทึกได้{" "}
          {loggedGoals.HOME}-{loggedGoals.AWAY}
          <span className="block text-[11px] text-red-300/70 mt-0.5">
            ตรวจไทม์ไลน์ด้านล่าง อาจมีประตูที่ยังไม่ได้ระบุผู้ยิงหรือฝั่งผิด
          </span>
        </div>
      )}

      {match.status !== "SCHEDULED" && (
        <div className="rounded-lg bg-card border border-white/10 p-4">
          <h3 className="text-sm font-semibold mb-2">เหตุการณ์ที่บันทึกแล้ว</h3>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "ประตู", value: eventCounts.goals, tone: "text-accent" },
              { label: "ใบเหลือง", value: eventCounts.yellow, tone: "text-yellow-400" },
              { label: "ใบแดง", value: eventCounts.red, tone: "text-red-400" },
              { label: "เปลี่ยนตัว", value: eventCounts.subs, tone: "text-foreground/80" },
            ].map((c) => (
              <div key={c.label} className="rounded-md bg-black/30 border border-white/10 py-2">
                <div className={`font-display font-bold text-2xl ${c.tone}`}>{c.value}</div>
                <div className="text-[11px] text-foreground/50">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {match.status === "LIVE" && (
        <div className="rounded-lg bg-card border border-white/10 p-4">
          <h3 className="text-sm font-semibold mb-2">สถิติด่วน (+1)</h3>
          <div className="grid grid-cols-2 gap-3">
            {(["HOME", "AWAY"] as const).map((side) => (
              <div key={side} className="flex flex-wrap gap-2">
                <span className="text-xs text-foreground/50 w-full">
                  {side === "HOME" ? match.homeTeam.name : match.awayTeam.name}{" "}
                  <span className="text-foreground/35">
                    (ยิง {side === "HOME" ? match.homeShots : match.awayShots} · มุม{" "}
                    {side === "HOME" ? match.homeCorners : match.awayCorners} · ฟาวล์{" "}
                    {side === "HOME" ? match.homeFouls : match.awayFouls})
                  </span>
                </span>
                {[
                  { stat: "Shots", label: "ยิง" },
                  { stat: "Corners", label: "เตะมุม" },
                  { stat: "Fouls", label: "ฟาวล์" },
                ].map(({ stat, label }) => (
                  <form key={stat} action={quickStatWithId}>
                    <input type="hidden" name="side" value={side} />
                    <input type="hidden" name="stat" value={stat} />
                    <button type="submit" className="rounded-md bg-white/10 px-3 py-1.5 text-xs">
                      +{label}
                    </button>
                  </form>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <form action={updateMatchInfoWithId} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-40 space-y-1">
          <label className="text-sm text-foreground/70" htmlFor="venue">
            สนามแข่ง
          </label>
          <input
            id="venue"
            name="venue"
            defaultValue={match.venue ?? ""}
            placeholder="เช่น สนามกีฬาเทศบาล"
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        {match.status === "SCHEDULED" && (
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="kickoffAt">
              วัน-เวลาแข่ง
            </label>
            <input
              id="kickoffAt"
              name="kickoffAt"
              type="datetime-local"
              defaultValue={match.kickoffAt.toISOString().slice(0, 16)}
              className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        )}
        <div className="flex-1 min-w-40 space-y-1">
          <label className="text-sm text-foreground/70" htmlFor="streamUrl">
            ลิงก์ถ่ายทอดสด
          </label>
          <input
            id="streamUrl"
            name="streamUrl"
            defaultValue={match.streamUrl ?? ""}
            placeholder="https://youtube.com/..."
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-foreground/70" htmlFor="refereeName">
            ผู้ตัดสิน
          </label>
          <input
            id="refereeName"
            name="refereeName"
            defaultValue={match.refereeName ?? ""}
            className="w-36 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-foreground/70" htmlFor="spectators">
            ผู้ชม
          </label>
          <input
            id="spectators"
            name="spectators"
            type="number"
            min={0}
            defaultValue={match.spectators ?? ""}
            className="w-24 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="w-full space-y-1">
          <label className="text-sm text-foreground/70" htmlFor="note">
            หมายเหตุแมตช์ (โชว์หน้าสาธารณะ)
          </label>
          <input
            id="note"
            name="note"
            defaultValue={match.note ?? ""}
            placeholder="เช่น เลื่อนจากสัปดาห์ก่อนเพราะฝนตก"
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
          บันทึกข้อมูลแมตช์
        </button>
      </form>

      {match.status === "SCHEDULED" && (
        <div className="rounded-lg bg-card border border-white/10 p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
            เช็กความพร้อมก่อนเริ่ม
            <span
              className={`text-xs font-normal ${readyCount === readiness.length ? "text-accent" : "text-foreground/40"}`}
            >
              {readyCount}/{readiness.length} พร้อม
            </span>
          </h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {readiness.map((r) => (
              <li
                key={r.label}
                className={r.done ? "text-foreground/70" : "text-amber-400/80"}
              >
                {r.done ? "✓" : "○"} {r.label}
              </li>
            ))}
          </ul>
          {readyCount < readiness.length && (
            <p className="mt-2 text-[11px] text-foreground/35">
              เริ่มแข่งได้เลย แต่ควรกรอกข้อมูลด้านบนให้ครบก่อนคิกออฟ
            </p>
          )}
        </div>
      )}

      {match.status === "SCHEDULED" && (
        <div className="flex gap-3">
          <form action={kickOffWithId}>
            <button
              type="submit"
              className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm"
            >
              เริ่มการแข่งขัน
            </button>
          </form>
          <form action={swapSides.bind(null, id)}>
            <button type="submit" className="rounded-md bg-white/10 px-5 py-2 text-sm">
              ⇄ สลับเหย้า-เยือน
            </button>
          </form>
        </div>
      )}

      {match.status === "LIVE" && (
        <div className="grid grid-cols-2 gap-6">
          <MatchActionForms
            side="HOME"
            teamName={match.homeTeam.name}
            players={homePlayers}
            allPlayers={match.homeTeam.players}
            addGoal={addGoalWithId}
            addCard={addCardWithId}
            addSub={addSubWithId}
            addInjury={recordInjuryWithId}
            defaultMinute={liveMinute}
          />
          <MatchActionForms
            side="AWAY"
            teamName={match.awayTeam.name}
            players={awayPlayers}
            allPlayers={match.awayTeam.players}
            addGoal={addGoalWithId}
            addCard={addCardWithId}
            addSub={addSubWithId}
            addInjury={recordInjuryWithId}
            defaultMinute={liveMinute}
          />
        </div>
      )}

      {match.status === "LIVE" &&
        (() => {
          const booked = match.events.filter(
            (e) => (e.type === "YELLOW_CARD" || e.type === "RED_CARD") && e.player
          );
          return booked.length > 0 ? (
            <p className="text-xs text-foreground/50">
              ใบโทษนัดนี้:{" "}
              {booked
                .map((e) => `${e.type === "RED_CARD" ? "🟥" : "🟨"} ${e.player!.name}`)
                .join(" · ")}
            </p>
          ) : null;
        })()}

      {match.status === "LIVE" && (
        <p className="text-xs text-foreground/50">
          เปลี่ยนตัวแล้ว:{" "}
          <span className={subsUsed.HOME >= SUB_LIMIT ? "text-amber-400/80" : ""}>
            {match.homeTeam.abbr} {subsUsed.HOME}/{SUB_LIMIT}
          </span>{" "}
          ·{" "}
          <span className={subsUsed.AWAY >= SUB_LIMIT ? "text-amber-400/80" : ""}>
            {match.awayTeam.abbr} {subsUsed.AWAY}/{SUB_LIMIT}
          </span>
          {(subsUsed.HOME >= SUB_LIMIT || subsUsed.AWAY >= SUB_LIMIT) && " (เต็มโควตา)"}
        </p>
      )}

      {match.status === "LIVE" && (
        <div className="flex gap-3">
          {!hasHalfTime && (
            <>
              <form action={halfTimeWithId}>
                <button type="submit" className="rounded-md bg-white/10 px-5 py-2 text-sm">
                  ⏸ พักครึ่ง (นาทีจริง)
                </button>
              </form>
              <form action={halfTimeWithId}>
                <input type="hidden" name="fixed45" value="1" />
                <button type="submit" className="rounded-md bg-white/10 px-5 py-2 text-sm">
                  ⏸ พักครึ่งที่ 45&apos;
                </button>
              </form>
            </>
          )}
          <form action={endMatchWithId}>
            <button type="submit" className="rounded-md bg-white/10 px-5 py-2 text-sm">
              จบการแข่งขัน
            </button>
          </form>
        </div>
      )}

      {match.status === "FINISHED" && (
        <form action={reopenMatch.bind(null, id)}>
          <button type="submit" className="rounded-md bg-white/10 px-5 py-2 text-sm">
            ↩ เปิดแมตช์อีกครั้ง (แก้ผล)
          </button>
        </form>
      )}

      {match.status === "LIVE" && match.events.length > 1 && (
        <form action={resetEvents.bind(null, id)}>
          <button type="submit" className="text-xs text-red-400/70 hover:text-red-400">
            🗑 ล้างเหตุการณ์ทั้งหมด (สกอร์กลับ 0-0, เก็บเวลาเริ่มไว้)
          </button>
        </form>
      )}

      {match.status === "FINISHED" && (
        <form
          action={updateMvp.bind(null, id)}
          className="flex items-end gap-2 rounded-lg bg-card border border-white/10 p-4"
        >
          <div className="flex-1 space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="mvpPlayerId">
              ⭐ ผู้เล่นยอดเยี่ยม (MVP)
            </label>
            <select
              id="mvpPlayerId"
              name="mvpPlayerId"
              defaultValue={match.mvpPlayerId ?? ""}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">- ไม่ระบุ -</option>
              <optgroup label={match.homeTeam.name}>
                {(homeLineupPlayers.length > 0 ? homeLineupPlayers : match.homeTeam.players).map(
                  (p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </option>
                  )
                )}
              </optgroup>
              <optgroup label={match.awayTeam.name}>
                {(awayLineupPlayers.length > 0 ? awayLineupPlayers : match.awayTeam.players).map(
                  (p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </option>
                  )
                )}
              </optgroup>
            </select>
          </div>
          <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
            บันทึก MVP
          </button>
        </form>
      )}

      {match.status !== "SCHEDULED" && (
        <div>
          <h2 className="font-semibold mb-3">สถิติแมตช์</h2>
          <form
            action={updateStatsWithId}
            className="rounded-lg bg-card border border-white/10 p-4 space-y-3"
          >
            {STAT_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-3 text-sm">
                <input
                  type="number"
                  name={`home${f.key}`}
                  defaultValue={match[`home${f.key}` as keyof typeof match] as number}
                  className="w-16 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-center"
                />
                <span className="flex-1 text-center text-foreground/60">{f.label}</span>
                <input
                  type="number"
                  name={`away${f.key}`}
                  defaultValue={match[`away${f.key}` as keyof typeof match] as number}
                  className="w-16 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-center"
                />
              </div>
            ))}
            <button type="submit" className="rounded-md bg-accent text-black text-xs px-4 py-2">
              บันทึกสถิติ
            </button>
          </form>
        </div>
      )}

      {h2h.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
            ผลเจอกันล่าสุด
            <Link
              href={`/leagues/${match.leagueId}/compare?a=${match.homeTeamId}&b=${match.awayTeamId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline font-normal"
            >
              เทียบเต็ม ↗
            </Link>
          </h3>
          <div className="space-y-1">
            {h2h.map((m) => (
              <div key={m.id} className="grid grid-cols-[1fr_56px_1fr] items-center gap-2 text-xs text-foreground/70">
                <span className="text-right truncate">{m.homeTeam.name}</span>
                <span className="text-center font-display font-bold text-foreground">
                  {m.homeScore}-{m.awayScore}
                </span>
                <span className="truncate">{m.awayTeam.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {scoreTimeline.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-4">
          <h3 className="text-sm font-semibold mb-2">ลำดับการทำประตู</h3>
          <div className="space-y-1">
            {scoreTimeline.map((g) => (
              <div
                key={g.id}
                className="grid grid-cols-[1fr_56px_1fr] items-center gap-2 text-xs"
              >
                <span
                  className={`truncate text-right ${g.side === "HOME" ? "text-foreground/80" : "text-foreground/35"}`}
                >
                  {g.side === "HOME" ? (
                    <>
                      {g.minute}&apos; {g.scorer}
                      {g.isOwn ? " (OG)" : ""}
                    </>
                  ) : (
                    ""
                  )}
                </span>
                <span className="text-center font-display font-bold text-accent">
                  {g.home}-{g.away}
                </span>
                <span
                  className={`truncate ${g.side === "AWAY" ? "text-foreground/80" : "text-foreground/35"}`}
                >
                  {g.side === "AWAY" ? (
                    <>
                      {g.minute}&apos; {g.scorer}
                      {g.isOwn ? " (OG)" : ""}
                    </>
                  ) : (
                    ""
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3">ไทม์ไลน์ (แก้นาทีในช่องได้)</h2>
        <MatchTimeline
          events={match.events}
          deleteAction={deleteEventWithId}
          editMinuteAction={updateEventMinuteWithId}
        />
      </div>
    </div>
  );
}

function MatchActionForms({
  side,
  teamName,
  players,
  allPlayers,
  addGoal,
  addCard,
  addSub,
  addInjury,
  defaultMinute,
}: {
  side: "HOME" | "AWAY";
  teamName: string;
  players: { id: string; name: string; number: number }[];
  allPlayers: { id: string; name: string; number: number }[];
  addGoal: (formData: FormData) => Promise<void>;
  addCard: (formData: FormData) => Promise<void>;
  addSub: (formData: FormData) => Promise<void>;
  addInjury: (formData: FormData) => Promise<void>;
  defaultMinute: number;
}) {
  return (
    <div className="rounded-lg bg-card border border-white/10 p-4 space-y-3">
      <h3 className="text-sm font-semibold">{teamName}</h3>

      <form action={addGoal} className="flex flex-wrap gap-2 items-end">
        <input type="hidden" name="side" value={side} />
        <PlayerAndMinuteFields players={players} defaultMinute={defaultMinute} />
        <select
          name="assistPlayerId"
          className="rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs flex-1 min-w-24"
        >
          <option value="">- แอสซิสต์ -</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              #{p.number} {p.name}
            </option>
          ))}
        </select>
        <select
          name="goalType"
          className="rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs"
        >
          <option value="NORMAL">ปกติ</option>
          <option value="PENALTY">จุดโทษ</option>
          <option value="OWN_GOAL">เข้าตัวเอง</option>
          <option value="PENALTY_MISSED">จุดโทษพลาด</option>
        </select>
        <button type="submit" className="rounded-md bg-accent text-black text-xs px-3 py-2">
          ประตู
        </button>
      </form>

      <form action={addCard} className="flex gap-2 items-end">
        <input type="hidden" name="side" value={side} />
        <PlayerAndMinuteFields players={players} defaultMinute={defaultMinute} />
        <select name="cardType" className="rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs">
          <option value="YELLOW">ใบเหลือง</option>
          <option value="RED">ใบแดง</option>
        </select>
        <button type="submit" className="rounded-md bg-white/10 text-xs px-3 py-2">
          บันทึก
        </button>
      </form>

      <form action={addSub} className="space-y-2">
        <input type="hidden" name="side" value={side} />
        <div className="flex gap-2">
          <select
            name="playerOutId"
            required
            className="rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs flex-1"
          >
            <option value="">- ออก -</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number} {p.name}
              </option>
            ))}
          </select>
          <select
            name="playerInId"
            required
            className="rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs flex-1"
          >
            <option value="">- เข้า -</option>
            {allPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-end">
          <input
            type="number"
            name="minute"
            defaultValue={defaultMinute}
            className="w-16 rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs"
          />
          <button type="submit" className="rounded-md bg-white/10 text-xs px-3 py-2">
            🔄 เปลี่ยนตัว
          </button>
        </div>
      </form>

      <form action={addInjury} className="flex gap-2 items-end">
        <input type="hidden" name="side" value={side} />
        <PlayerAndMinuteFields players={players} defaultMinute={defaultMinute} />
        <button type="submit" className="rounded-md bg-white/10 text-xs px-3 py-2">
          🚑 บาดเจ็บ
        </button>
      </form>
    </div>
  );
}

function PlayerAndMinuteFields({
  players,
  defaultMinute,
}: {
  players: { id: string; name: string; number: number }[];
  defaultMinute: number;
}) {
  return (
    <>
      <select name="playerId" className="rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs flex-1">
        <option value="">- ไม่ระบุ -</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            #{p.number} {p.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        name="minute"
        defaultValue={defaultMinute}
        className="w-16 rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs"
      />
    </>
  );
}
