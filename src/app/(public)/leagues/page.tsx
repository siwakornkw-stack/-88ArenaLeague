import Link from "next/link";
import { getFeaturedLeagues } from "@/lib/featuredLeagues";
import { MobileNav } from "@/components/mobile-nav";

export const dynamic = "force-dynamic";

export default async function LeaguesIndexPage() {
  const leagues = await getFeaturedLeagues(100);

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ลีกทั้งหมด", href: "/leagues", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
          ลีก<span className="text-accent">ทั้งหมด</span>
        </h1>
        <p className="mt-1 text-sm text-foreground/55">{leagues.length} ลีกที่เปิดให้ชม</p>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1">
        {leagues.length === 0 ? (
          <p className="text-foreground/50 text-sm">ยังไม่มีลีกที่เปิดให้ชมสาธารณะ</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leagues.map((lg) => (
              <Link
                key={lg.id}
                href={`/leagues/${lg.id}`}
                className="rounded-2xl border border-white/10 bg-card p-5 hover:border-accent/50"
              >
                <div className="font-display italic font-extrabold text-xl text-foreground">
                  {lg.name}
                </div>
                <div className="mt-1 text-xs text-foreground/45">{lg.type}</div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-foreground/60">
                  <span>⚽ {lg.teams} ทีม</span>
                  {lg.totalRounds > 0 ? (
                    <span>📅 นัดที่ {lg.round}/{lg.totalRounds}</span>
                  ) : (
                    <span>ยังไม่เริ่มแข่ง</span>
                  )}
                  {lg.live > 0 && <span className="text-accent">● {lg.live} แมตช์สด</span>}
                </div>
                {lg.top3.length > 0 && (
                  <div className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm space-y-1">
                    {lg.top3.map((t, i) => (
                      <div key={t.name} className="flex items-center justify-between">
                        <span className="text-foreground/80">
                          <span className="font-display font-bold text-foreground/40 mr-2">
                            {i + 1}
                          </span>
                          {t.name}
                        </span>
                        <span className="text-foreground/50 text-xs">{t.points} แต้ม</span>
                      </div>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
