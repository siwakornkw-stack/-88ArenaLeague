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
    select: { id: true },
  });
  const idx = siblings.findIndex((m) => m.id === id);
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;

  const kickOffWithId = kickOff.bind(null, id);
  const addGoalWithId = addGoal.bind(null, id);
  const addCardWithId = addCard.bind(null, id);
  const addSubWithId = addSubstitution.bind(null, id);
  const endMatchWithId = endMatch.bind(null, id);
  const updateStatsWithId = updateStats.bind(null, id);
  const updateMatchInfoWithId = updateMatchInfo.bind(null, id);
  const halfTimeWithId = halfTime.bind(null, id);
  const deleteEventWithId = deleteEvent.bind(null, id);
  const quickStatWithId = quickStat.bind(null, id);
  const hasHalfTime = match.events.some((e) => e.type === "HALF_TIME");
  const homeLineupCount = match.lineups.filter((l) =>
    match.homeTeam.players.some((p) => p.id === l.playerId)
  ).length;
  const awayLineupCount = match.lineups.length - homeLineupCount;

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
        <Link
          href={`/admin/leagues/${match.leagueId}`}
          className="text-foreground/60 hover:text-accent"
        >
          ตารางแข่ง
        </Link>
        {nextId ? (
          <Link href={`/admin/matches/${nextId}`} className="text-foreground/60 hover:text-accent">
            นัดถัดไป →
          </Link>
        ) : (
          <span />
        )}
      </div>

      <div className="rounded-lg bg-card border border-white/10 p-6 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold flex-1 text-right">{match.homeTeam.name}</span>
          <span className="font-display font-bold text-4xl px-6">
            {match.homeScore} - {match.awayScore}
          </span>
          <span className="font-semibold flex-1">{match.awayTeam.name}</span>
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
      </div>

      {match.status === "LIVE" && (
        <div className="rounded-lg bg-card border border-white/10 p-4">
          <h3 className="text-sm font-semibold mb-2">สถิติด่วน (+1)</h3>
          <div className="grid grid-cols-2 gap-3">
            {(["HOME", "AWAY"] as const).map((side) => (
              <div key={side} className="flex flex-wrap gap-2">
                <span className="text-xs text-foreground/50 w-full">
                  {side === "HOME" ? match.homeTeam.name : match.awayTeam.name}
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
        <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
          บันทึกข้อมูลแมตช์
        </button>
      </form>

      {match.status === "SCHEDULED" && (
        <form action={kickOffWithId}>
          <button
            type="submit"
            className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm"
          >
            เริ่มการแข่งขัน
          </button>
        </form>
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
            defaultMinute={liveMinute}
          />
        </div>
      )}

      {match.status === "LIVE" && (
        <div className="flex gap-3">
          {!hasHalfTime && (
            <form action={halfTimeWithId}>
              <button type="submit" className="rounded-md bg-white/10 px-5 py-2 text-sm">
                ⏸ พักครึ่ง
              </button>
            </form>
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
                {match.homeTeam.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={match.awayTeam.name}>
                {match.awayTeam.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} {p.name}
                  </option>
                ))}
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

      <div>
        <h2 className="font-semibold mb-3">ไทม์ไลน์</h2>
        <MatchTimeline events={match.events} deleteAction={deleteEventWithId} />
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
  defaultMinute,
}: {
  side: "HOME" | "AWAY";
  teamName: string;
  players: { id: string; name: string; number: number }[];
  allPlayers: { id: string; name: string; number: number }[];
  addGoal: (formData: FormData) => Promise<void>;
  addCard: (formData: FormData) => Promise<void>;
  addSub: (formData: FormData) => Promise<void>;
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
