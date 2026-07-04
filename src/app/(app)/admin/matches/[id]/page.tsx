import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { MatchTimeline } from "@/components/match-timeline";
import { kickOff, addGoal, addCard, endMatch, updateStats, updateVenue } from "./actions";

const STAT_FIELDS = [
  { key: "Possession", label: "ครองบอล %" },
  { key: "Shots", label: "ยิงทั้งหมด" },
  { key: "ShotsOnTarget", label: "ยิงเข้ากรอบ" },
  { key: "Corners", label: "เตะมุม" },
  { key: "Fouls", label: "ฟาวล์" },
] as const;

export default async function MatchLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: { include: { players: true } },
      awayTeam: { include: { players: true } },
      events: { orderBy: [{ minute: "asc" }, { createdAt: "asc" }] },
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

  const kickOffWithId = kickOff.bind(null, id);
  const addGoalWithId = addGoal.bind(null, id);
  const addCardWithId = addCard.bind(null, id);
  const endMatchWithId = endMatch.bind(null, id);
  const updateStatsWithId = updateStats.bind(null, id);
  const updateVenueWithId = updateVenue.bind(null, id);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="rounded-lg bg-card border border-white/10 p-6 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold flex-1 text-right">{match.homeTeam.name}</span>
          <span className="font-display font-bold text-4xl px-6">
            {match.homeScore} - {match.awayScore}
          </span>
          <span className="font-semibold flex-1">{match.awayTeam.name}</span>
        </div>
        {match.status === "LIVE" && (
          <p className="text-center text-xs text-accent">LIVE {liveMinute}&apos;</p>
        )}
      </div>

      <form action={updateVenueWithId} className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
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
        <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
          บันทึกสนาม
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
            addGoal={addGoalWithId}
            addCard={addCardWithId}
            defaultMinute={liveMinute}
          />
          <MatchActionForms
            side="AWAY"
            teamName={match.awayTeam.name}
            players={awayPlayers}
            addGoal={addGoalWithId}
            addCard={addCardWithId}
            defaultMinute={liveMinute}
          />
        </div>
      )}

      {match.status === "LIVE" && (
        <form action={endMatchWithId}>
          <button type="submit" className="rounded-md bg-white/10 px-5 py-2 text-sm">
            จบการแข่งขัน
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
        <MatchTimeline events={match.events} />
      </div>
    </div>
  );
}

function MatchActionForms({
  side,
  teamName,
  players,
  addGoal,
  addCard,
  defaultMinute,
}: {
  side: "HOME" | "AWAY";
  teamName: string;
  players: { id: string; name: string; number: number }[];
  addGoal: (formData: FormData) => Promise<void>;
  addCard: (formData: FormData) => Promise<void>;
  defaultMinute: number;
}) {
  return (
    <div className="rounded-lg bg-card border border-white/10 p-4 space-y-3">
      <h3 className="text-sm font-semibold">{teamName}</h3>

      <form action={addGoal} className="flex gap-2 items-end">
        <input type="hidden" name="side" value={side} />
        <PlayerAndMinuteFields players={players} defaultMinute={defaultMinute} />
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
