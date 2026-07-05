import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";

export default async function AdminTodayPage() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

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
        <h1 className="font-display font-bold text-3xl">แมตช์วันนี้ทุกลีก</h1>
        <p className="text-foreground/60 mt-1">
          {now.toLocaleDateString("th-TH", { dateStyle: "full" })} · {matches.length} แมตช์
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
              <Link
                key={m.id}
                href={`/admin/matches/${m.id}`}
                className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
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
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
