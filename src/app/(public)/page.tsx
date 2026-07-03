import Link from "next/link";
import { prisma } from "@/lib/db";
import { getFeaturedLeagues } from "@/lib/featuredLeagues";
import { computeLiveMinute } from "@/lib/matchClock";
import { MobileNav } from "@/components/mobile-nav";

const FEATURES = [
  { icon: "⚙", title: "ตารางแข่งอัตโนมัติ", desc: "สร้างโปรแกรมพบกันหมดในคลิกเดียว จัดสนามและเวลาให้เอง" },
  { icon: "⚡", title: "ผลสดเรียลไทม์", desc: "บันทึกประตู ใบเหลือง-แดง จากมือถือข้างสนาม อัปเดตทุกหน้าอัตโนมัติ" },
  { icon: "🏆", title: "หลายลีกในที่เดียว", desc: "จัดฟุตบอล 7 คน ลีกเยาวชน ลีกองค์กร พร้อมกันไม่จำกัดจำนวน" },
  { icon: "📣", title: "หน้าโปรโมตมืออาชีพ", desc: "หน้าลีกสาธารณะสวยพร้อมแชร์ ดึงสปอนเซอร์และแฟนบอลเข้าหาลีกคุณ" },
];

export default async function Home() {
  const [featuredLeagues, leagueCount, teamCount, playerCount, matchCount, liveMatches] =
    await Promise.all([
      getFeaturedLeagues(3),
      prisma.league.count({ where: { status: { not: "DRAFT" } } }),
      prisma.team.count(),
      prisma.player.count(),
      prisma.match.count({ where: { status: { in: ["LIVE", "FINISHED"] } } }),
      prisma.match.findMany({
        where: { status: "LIVE" },
        include: {
          homeTeam: true,
          awayTeam: true,
          league: true,
          events: { where: { type: "KICK_OFF" } },
        },
        take: 5,
      }),
    ]);

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/", active: true },
    ...(featuredLeagues[0]
      ? [{ icon: "🏆", label: "ตารางคะแนน", href: `/leagues/${featuredLeagues[0].id}?tab=standings` }]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      {liveMatches.length > 0 && (
        <div className="bg-accent overflow-x-auto">
          <div className="flex gap-10 whitespace-nowrap px-6 py-2 font-display font-semibold text-sm text-black">
            {liveMatches.map((m) => (
              <span key={m.id}>
                ● LIVE — {m.homeTeam.name} {m.homeScore}-{m.awayScore} {m.awayTeam.name} (
                {m.events[0] ? computeLiveMinute(m.events[0].createdAt) : m.minute}
                &apos;)
              </span>
            ))}
          </div>
        </div>
      )}

      <section className="relative overflow-hidden px-6 md:px-16 py-16 md:py-24 bg-gradient-to-br from-background to-[#12240F]">
        <div className="max-w-2xl relative">
          <span className="inline-block rounded-full border border-accent/40 px-4 py-1 text-xs font-display font-semibold text-accent tracking-widest">
            แพลตฟอร์มจัดการลีกฟุตบอล
          </span>
          <h1 className="mt-6 font-display italic font-black text-4xl md:text-6xl leading-tight text-foreground">
            จัดลีกของคุณ
            <br />
            ให้เป็น <span className="text-accent">ลีกอาชีพ</span>
          </h1>
          <p className="mt-6 text-foreground/70 text-base md:text-lg max-w-lg">
            แพลตฟอร์มจัดการลีกฟุตบอลครบวงจร — ฟุตบอล 7 คน ลีกเยาวชน ลีกองค์กร ตารางแข่งอัตโนมัติ
            ผลสดเรียลไทม์ หน้าโปรโมตสวยระดับมืออาชีพ
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-md bg-accent px-8 py-3 font-display font-bold text-black"
            >
              เริ่มจัดลีกฟรี
            </Link>
            {featuredLeagues[0] && (
              <Link
                href={`/leagues/${featuredLeagues[0].id}`}
                className="rounded-md border border-white/25 px-8 py-3 font-display font-semibold text-foreground"
              >
                ดูลีกที่กำลังแข่ง
              </Link>
            )}
          </div>
          <div className="mt-14 flex flex-wrap gap-10">
            <Stat value={leagueCount} label="ลีกที่กำลังแข่ง" />
            <Stat value={teamCount} label="ทีมทั้งหมด" />
            <Stat value={playerCount} label="นักเตะลงทะเบียน" />
            <Stat value={matchCount} label="แมตช์ที่บันทึกผล" />
          </div>
        </div>
      </section>

      <section id="leagues" className="px-6 md:px-16 py-14 scroll-mt-20">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="font-display italic font-extrabold text-2xl md:text-3xl text-foreground">
            ลีกเด่น<span className="text-accent">ประจำสัปดาห์</span>
          </h2>
        </div>
        {featuredLeagues.length === 0 ? (
          <p className="text-foreground/50 text-sm">ยังไม่มีลีกที่เปิดให้ชมสาธารณะ</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredLeagues.map((lg) => (
              <Link
                key={lg.id}
                href={`/leagues/${lg.id}`}
                className="rounded-2xl border border-white/10 bg-card overflow-hidden hover:border-accent/50"
              >
                <div className="p-5">
                  <div className="font-display italic font-extrabold text-xl text-foreground">
                    {lg.name}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-foreground/60">
                    <span>⚽ {lg.teams} ทีม</span>
                    {lg.totalRounds > 0 && <span>📅 นัดที่ {lg.round}</span>}
                    {lg.live > 0 && <span className="text-accent">● {lg.live} แมตช์สด</span>}
                  </div>
                  {lg.leaderName && (
                    <div className="mt-4 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                      <span className="font-display font-semibold text-foreground">
                        {lg.leaderName}
                      </span>
                      <span className="text-foreground/50 text-xs">จ่าฝูง · {lg.leaderPoints} แต้ม</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="px-6 md:px-16 py-14 bg-accent">
        <h2 className="font-display italic font-extrabold text-2xl md:text-3xl text-black mb-8">
          ทุกอย่างที่ผู้จัดลีกต้องการ
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl bg-background p-5">
              <div className="text-2xl text-accent mb-2">{f.icon}</div>
              <div className="font-display font-bold text-foreground mb-1">{f.title}</div>
              <div className="text-sm text-foreground/60 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 md:px-16 py-8 flex items-center justify-between border-t border-white/10 text-sm">
        <span className="font-display italic font-bold text-foreground">
          88ARENA<span className="text-accent">LEAGUE</span>
        </span>
        <span className="text-foreground/40 text-xs">© 2026 88ArenaLeague — แพลตฟอร์มจัดการลีกฟุตบอล</span>
      </footer>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-display italic font-extrabold text-3xl text-accent">{value}</div>
      <div className="text-sm text-foreground/55">{label}</div>
    </div>
  );
}
