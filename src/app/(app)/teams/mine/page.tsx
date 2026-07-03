import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { addPlayer, updatePlayerStatus, deletePlayer, setLineup } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ปกติ",
  INJURED: "บาดเจ็บ",
  BANNED: "โดนแบน",
};

const LINEUP_SIZE = 12;

export default async function MyTeamPage() {
  const session = await getSession();
  if (session?.role !== "TEAM_MANAGER") redirect("/dashboard");

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

  const nextMatch = await prisma.match.findFirst({
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
  });

  const selectedPlayerIds = new Set(nextMatch?.lineups.map((l) => l.playerId) ?? []);
  const eligiblePlayers = team.players.filter((p) => p.status === "ACTIVE");
  const addPlayerWithId = addPlayer.bind(null, team.id);
  const setLineupWithId = nextMatch ? setLineup.bind(null, nextMatch.id) : null;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display font-bold text-3xl">{team.name}</h1>
        <p className="text-foreground/60 mt-1">จัดการนักเตะและตัวจริงของทีมคุณ</p>
      </div>

      {nextMatch && setLineupWithId && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-1">เลือกตัวจริงนัดถัดไป</h2>
          <p className="text-sm text-foreground/60 mb-4">
            {nextMatch.homeTeam.name} vs {nextMatch.awayTeam.name} ·{" "}
            {nextMatch.kickoffAt.toLocaleDateString("th-TH")}
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
            <p className="text-xs text-foreground/50">
              เลือกแล้ว {selectedPlayerIds.size}/{LINEUP_SIZE}
            </p>
            <button type="submit" className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm">
              บันทึกตัวจริง
            </button>
          </form>
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3">รายชื่อนักเตะ</h2>
        <div className="space-y-2">
          {team.players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-md bg-card border border-white/10 px-4 py-3 text-sm"
            >
              <span className="w-8 text-foreground/50">#{p.number}</span>
              <span className="flex-1">{p.name}</span>
              <span className="text-foreground/50">{p.position}</span>
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
          {team.players.length === 0 && (
            <p className="text-foreground/50 text-sm">ยังไม่มีนักเตะในทีม</p>
          )}
        </div>
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
          <button type="submit" className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm">
            เพิ่มนักเตะ
          </button>
        </form>
      </div>
    </div>
  );
}
