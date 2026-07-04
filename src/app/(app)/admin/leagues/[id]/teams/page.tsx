import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  createTeam,
  updateTeam,
  deleteTeam,
  createTeamManager,
  removeManager,
  transferPlayer,
} from "./actions";

export default async function LeagueTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const { id } = await params;
  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      teams: {
        include: {
          managers: true,
          players: { orderBy: { number: "asc" } },
          _count: { select: { players: true, homeMatches: true, awayMatches: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!league) notFound();

  const createTeamWithId = createTeam.bind(null, id);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href={`/admin/leagues/${id}`} className="text-sm text-foreground/50 hover:text-accent">
          ← {league.name}
        </Link>
        <h1 className="font-display font-bold text-3xl mt-2">จัดการทีม</h1>
        <p className="text-foreground/60 mt-1">เพิ่มทีมและกำหนดผู้จัดการทีมสำหรับ {league.name}</p>
      </div>

      <div className="space-y-3">
        {league.teams.map((team) => {
          const hasMatches = team._count.homeMatches + team._count.awayMatches > 0;
          return (
            <div key={team.id} className="rounded-lg bg-card border border-white/10 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: team.color }}
                />
                <form
                  action={updateTeam.bind(null, team.id)}
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  <input
                    name="name"
                    defaultValue={team.name}
                    required
                    className="flex-1 min-w-[8rem] rounded-md bg-black/30 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <input
                    name="abbr"
                    defaultValue={team.abbr}
                    required
                    maxLength={4}
                    className="w-16 rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-center outline-none focus:border-accent"
                  />
                  <input
                    type="color"
                    name="color"
                    defaultValue={team.color}
                    className="h-8 w-8 rounded-md bg-black/30 border border-white/10"
                  />
                  <input
                    type="file"
                    name="logo"
                    accept="image/png,image/jpeg,image/webp"
                    className="text-xs text-foreground/50 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-foreground"
                  />
                  <button type="submit" className="rounded-md bg-white/10 px-3 py-1.5 text-xs">
                    บันทึก
                  </button>
                </form>
                <form action={deleteTeam.bind(null, team.id)}>
                  <button
                    type="submit"
                    disabled={hasMatches}
                    title={hasMatches ? "ลบไม่ได้ เนื่องจากมีตารางแข่งขันแล้ว" : undefined}
                    className="text-xs text-foreground/50 hover:text-red-400 disabled:opacity-30 disabled:hover:text-foreground/50"
                  >
                    ลบทีม
                  </button>
                </form>
              </div>

              <div className="pl-7 space-y-2">
                <p className="text-xs text-foreground/50">{team._count.players} นักเตะ</p>

                {team.managers.map((manager) => (
                  <div
                    key={manager.id}
                    className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm"
                  >
                    <span>
                      {manager.name} · {manager.email}
                    </span>
                    <form action={removeManager.bind(null, team.id, manager.id)}>
                      <button type="submit" className="text-xs text-foreground/50 hover:text-red-400">
                        เอาออก
                      </button>
                    </form>
                  </div>
                ))}

                {team.managers.length === 0 && (
                  <form
                    action={createTeamManager.bind(null, team.id)}
                    className="flex flex-wrap gap-2"
                  >
                    <input
                      name="name"
                      placeholder="ชื่อผู้จัดการทีม"
                      required
                      className="rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <input
                      name="email"
                      type="email"
                      placeholder="อีเมล"
                      required
                      className="rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <input
                      name="password"
                      type="password"
                      placeholder="รหัสผ่าน"
                      required
                      className="rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <button type="submit" className="rounded-md bg-accent text-black text-xs px-3 py-1.5">
                      เพิ่มผู้จัดการทีม
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {league.teams.length === 0 && (
          <p className="text-foreground/50 text-sm">ยังไม่มีทีมในลีกนี้</p>
        )}
      </div>

      {league.teams.length >= 2 && (
        <div className="rounded-lg bg-card border border-white/10 p-5 max-w-md">
          <h2 className="font-semibold mb-4">ย้ายนักเตะข้ามทีม</h2>
          <form action={transferPlayer.bind(null, id)} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="transfer-player">
                นักเตะ
              </label>
              <select
                id="transfer-player"
                name="playerId"
                required
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">- เลือกนักเตะ -</option>
                {league.teams.map((team) => (
                  <optgroup key={team.id} label={team.name}>
                    {team.players.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.number} {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="transfer-team">
                ย้ายไปทีม
              </label>
              <select
                id="transfer-team"
                name="toTeamId"
                required
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">- เลือกทีมปลายทาง -</option>
                {league.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-foreground/45">
              ถ้าเบอร์เสื้อซ้ำกับทีมปลายทาง ระบบจะเลื่อนเป็นเบอร์ว่างถัดไปให้อัตโนมัติ
            </p>
            <button
              type="submit"
              className="rounded-md bg-accent text-black font-semibold px-4 py-2 text-sm"
            >
              ยืนยันย้ายทีม
            </button>
          </form>
        </div>
      )}

      <div className="rounded-lg bg-card border border-white/10 p-5 max-w-sm">
        <h2 className="font-semibold mb-4">เพิ่มทีม</h2>
        <form action={createTeamWithId} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="name">
              ชื่อทีม
            </label>
            <input
              id="name"
              name="name"
              required
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="abbr">
              ชื่อย่อ
            </label>
            <input
              id="abbr"
              name="abbr"
              required
              maxLength={4}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="color">
              สีทีม
            </label>
            <input
              id="color"
              name="color"
              type="color"
              defaultValue="#2E5CB8"
              className="w-full h-10 rounded-md bg-black/30 border border-white/10"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm"
          >
            เพิ่มทีม
          </button>
        </form>
      </div>
    </div>
  );
}
