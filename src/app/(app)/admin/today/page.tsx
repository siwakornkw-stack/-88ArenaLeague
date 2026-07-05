import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";

export default async function AdminTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const { d } = await searchParams;
  const now = new Date();
  const parsed = d ? new Date(`${d}T00:00`) : null;
  const base = parsed && !isNaN(parsed.getTime()) ? parsed : now;
  const startOfDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const isToday = startOfDay.toDateString() === now.toDateString();
  const toParam = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
      dt.getDate()
    ).padStart(2, "0")}`;
  const prevDay = new Date(startOfDay.getTime() - 86400000);
  const nextDay = new Date(startOfDay.getTime() + 86400000);

  const matches = await prisma.match.findMany({
    where: { kickoffAt: { gte: startOfDay, lt: endOfDay } },
    include: {
      homeTeam: true,
      awayTeam: true,
      league: true,
      events: { where: { type: "KICK_OFF" } },
    },
    orderBy: [{ league: { name: "asc" } }, { kickoffAt: "asc" }],
  });

  const byLeague = new Map<string, typeof matches>();
  for (const m of matches) {
    if (!byLeague.has(m.league.name)) byLeague.set(m.league.name, []);
    byLeague.get(m.league.name)!.push(m);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl">
          แมตช์{isToday ? "วันนี้" : ""}ทุกลีก
        </h1>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <Link
            href={`/admin/today?d=${toParam(prevDay)}`}
            className="rounded-md bg-white/10 px-3 py-1 hover:text-accent"
          >
            ← วันก่อน
          </Link>
          {!isToday && (
            <Link href="/admin/today" className="rounded-md bg-accent/15 text-accent px-3 py-1">
              วันนี้
            </Link>
          )}
          <Link
            href={`/admin/today?d=${toParam(nextDay)}`}
            className="rounded-md bg-white/10 px-3 py-1 hover:text-accent"
          >
            วันถัดไป →
          </Link>
        </div>
        <p className="text-foreground/60 mt-2">
          {startOfDay.toLocaleDateString("th-TH", { dateStyle: "full" })} · {matches.length} แมตช์ · ⚽{" "}
          {matches.reduce((s, m) => s + m.homeScore + m.awayScore, 0)} ประตู ·{" "}
          <span className="text-red-400">
            ● {matches.filter((m) => m.status === "LIVE").length} สด
          </span>
          {matches.some((m) => (m.spectators ?? 0) > 0) && (
            <>
              {" "}
              · 👥 {matches.reduce((s, m) => s + (m.spectators ?? 0), 0).toLocaleString()} ผู้ชม
            </>
          )}
        </p>
      </div>

      {matches.length === 0 && (
        <p className="text-foreground/50 text-sm">ไม่มีแมตช์วันนี้</p>
      )}

      {[...byLeague.entries()].map(([leagueName, ms]) => (
        <div key={leagueName} className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">{leagueName}</h2>
          <div className="space-y-2">
            {ms.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <Link href={`/admin/matches/${m.id}`} className="flex-1 flex items-center justify-between">
                  <span>
                    {m.homeTeam.name}{" "}
                    {m.status !== "SCHEDULED" && (
                      <b>
                        {m.homeScore}-{m.awayScore}
                      </b>
                    )}{" "}
                    {m.awayTeam.name}
                  </span>
                  <span
                    className={`text-xs ${m.status === "LIVE" ? "text-red-400" : "text-foreground/50"}`}
                  >
                    {m.status === "LIVE"
                      ? `● สด ${m.events[0] ? computeLiveMinute(m.events[0].createdAt) : 0}'`
                      : m.status === "FINISHED"
                        ? "จบ"
                        : m.kickoffAt.toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                  </span>
                </Link>
                <Link
                  href={`/matches/${m.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-foreground/40 hover:text-accent shrink-0"
                  title="เปิดหน้าสาธารณะ"
                >
                  ↗
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
