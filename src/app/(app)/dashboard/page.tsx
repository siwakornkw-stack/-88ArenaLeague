import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { createLeague } from "./actions";

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

  const [leagues, todayMatches, attentionMatches] = await Promise.all([
    prisma.league.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        teams: { select: { id: true } },
        matches: { select: { round: true, status: true } },
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
      include: { homeTeam: true, awayTeam: true, league: true },
      orderBy: { kickoffAt: "asc" },
      take: 8,
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
          ? `บันทึกผล ${m.homeTeam.name} vs ${m.awayTeam.name}`
          : `เริ่มการแข่งขัน ${m.homeTeam.name} vs ${m.awayTeam.name}`,
      href: `/admin/matches/${m.id}`,
    })),
  ].slice(0, 6);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-display font-bold text-3xl">ภาพรวมลีก</h1>
        <p className="text-foreground/60 mt-1">จัดการลีกฟุตบอลทั้งหมดของคุณ</p>
      </div>

      {tasks.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">งานที่รอดำเนินการ</h2>
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
          <h2 className="font-semibold mb-3">แมตช์วันนี้</h2>
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

      <div>
        <h2 className="font-semibold mb-3">ลีกทั้งหมด</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {leagues.map((league) => {
            const { totalRounds, currentRound } = computeRoundProgress(league.matches);
            const pending = league.matches.filter((m) => m.status === "LIVE").length;
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
                    {STATUS_LABEL[league.status]}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-foreground/60">
                  <span>
                    {totalRounds > 0 ? `นัดที่ ${currentRound}/${totalRounds}` : "ยังไม่มีตาราง"}
                  </span>
                  {pending > 0 && <span className="text-accent">● {pending} รอบันทึกผล</span>}
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
