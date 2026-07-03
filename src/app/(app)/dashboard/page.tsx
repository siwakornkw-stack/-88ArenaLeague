import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createLeague } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "จัดตารางแล้ว",
  IN_PROGRESS: "กำลังแข่งขัน",
  FINISHED: "จบฤดูกาล",
};

export default async function DashboardPage() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const leagues = await prisma.league.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { teams: true } } },
  });

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-display font-bold text-3xl">ภาพรวมลีก</h1>
        <p className="text-foreground/60 mt-1">จัดการลีกฟุตบอลทั้งหมดของคุณ</p>
      </div>

      <div className="space-y-3">
        {leagues.map((league) => (
          <Link
            key={league.id}
            href={`/admin/leagues/${league.id}`}
            className="flex items-center justify-between rounded-lg bg-card border border-white/10 px-5 py-4 hover:border-accent/50"
          >
            <div>
              <p className="font-semibold">{league.name}</p>
              <p className="text-sm text-foreground/50">
                ฤดูกาล {league.seasonYear} · {league._count.teams} ทีม
              </p>
            </div>
            <span className="text-xs rounded-full bg-white/5 px-3 py-1 text-foreground/70">
              {STATUS_LABEL[league.status]}
            </span>
          </Link>
        ))}
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
