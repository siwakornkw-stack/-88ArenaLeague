import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "แมตช์สดตอนนี้",
  description: "ทุกแมตช์ที่กำลังแข่งขันสดบน 88ArenaLeague",
};

export default async function LivePage() {
  const [live, upcoming] = await Promise.all([
    prisma.match.findMany({
      where: { status: "LIVE" },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
        events: { where: { type: "KICK_OFF" } },
      },
      orderBy: { kickoffAt: "asc" },
    }),
    prisma.match.findMany({
      where: { status: "SCHEDULED", kickoffAt: { gte: new Date() } },
      include: { homeTeam: true, awayTeam: true, league: true },
      orderBy: { kickoffAt: "asc" },
      take: 6,
    }),
  ]);

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🔴", label: "สด", href: "/live", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      {live.length > 0 && <meta httpEquiv="refresh" content="60" />}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <div className="glow-blob w-80 h-80 -top-24 right-10" />
        <h1 className="font-display italic font-black text-3xl md:text-5xl text-foreground">
          กำลังแข่ง<span className="text-accent">สด</span>
        </h1>
        <p className="mt-1 text-sm text-foreground/55">
          {live.length > 0 ? `${live.length} แมตช์กำลังแข่งขัน · รีเฟรชอัตโนมัติทุก 60 วิ` : "ยังไม่มีแมตช์สดตอนนี้"}
        </p>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-10">
        {live.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {live.map((m) => (
              <Link
                key={m.id}
                href={`/matches/${m.id}`}
                className="hover-lift rounded-xl border border-red-500/30 bg-card p-4 live-glow"
              >
                <div className="flex items-center justify-between text-[10px] mb-2">
                  <span className="text-foreground/40">{m.league.name}</span>
                  <span className="text-red-400">
                    ● {m.events[0] ? computeLiveMinute(m.events[0].createdAt) : 0}&apos;
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{m.homeTeam.name}</span>
                  <span className="font-display italic font-black text-2xl text-accent shrink-0">
                    {m.homeScore}-{m.awayScore}
                  </span>
                  <span className="truncate text-sm text-right">{m.awayTeam.name}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {upcoming.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-4">กำลังจะเริ่ม</h2>
            <div className="flex flex-col gap-2 max-w-2xl">
              {upcoming.map((m) => (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="grid grid-cols-[1fr_72px_1fr_auto] items-center gap-2 rounded-lg bg-card border border-white/10 px-3 py-2 text-sm hover:border-accent/50"
                >
                  <span className="text-right truncate">{m.homeTeam.name}</span>
                  <span className="text-center text-xs text-accent">
                    {m.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="truncate">{m.awayTeam.name}</span>
                  <span className="text-[10px] text-foreground/40">{m.league.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
