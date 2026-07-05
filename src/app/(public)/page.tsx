import Link from "next/link";
import { prisma } from "@/lib/db";
import { getFeaturedLeagues } from "@/lib/featuredLeagues";
import { computeStandings } from "@/lib/standings";
import { computeLiveMinute } from "@/lib/matchClock";
import { MobileNav } from "@/components/mobile-nav";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

const getCachedTopStandings = unstable_cache(
  async (leagueId: string) => (await computeStandings(leagueId)).slice(0, 5),
  ["landing-top-standings"],
  { revalidate: 30 }
);

const getCachedLandingStats = unstable_cache(
  async () => {
    const [featuredLeagues, leagueCount, teamCount, playerCount, matchCount] = await Promise.all([
      getFeaturedLeagues(3),
      prisma.league.count({ where: { status: { not: "DRAFT" } } }),
      prisma.team.count(),
      prisma.player.count(),
      prisma.match.count({ where: { status: { in: ["LIVE", "FINISHED"] } } }),
    ]);
    return { featuredLeagues, leagueCount, teamCount, playerCount, matchCount };
  },
  ["landing-stats"],
  { revalidate: 30 }
);

const FEATURES = [
  { icon: "⚙", title: "ตารางแข่งอัตโนมัติ", desc: "สร้างโปรแกรมพบกันหมดในคลิกเดียว จัดสนามและเวลาให้เอง" },
  { icon: "⚡", title: "ผลสดเรียลไทม์", desc: "บันทึกประตู ใบเหลือง-แดง จากมือถือข้างสนาม อัปเดตทุกหน้าอัตโนมัติ" },
  { icon: "🏆", title: "หลายลีกในที่เดียว", desc: "จัดฟุตบอล 7 คน ลีกเยาวชน ลีกองค์กร พร้อมกันไม่จำกัดจำนวน" },
  { icon: "📣", title: "หน้าโปรโมตมืออาชีพ", desc: "หน้าลีกสาธารณะสวยพร้อมแชร์ ดึงสปอนเซอร์และแฟนบอลเข้าหาลีกคุณ" },
];

export default async function Home() {
  const [{ featuredLeagues, leagueCount, teamCount, playerCount, matchCount }, liveMatches, recentResults, nextUp, finishedCount] =
    await Promise.all([
      getCachedLandingStats(),
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
      prisma.match.findMany({
        where: { status: "FINISHED" },
        include: { homeTeam: true, awayTeam: true, league: true },
        orderBy: { kickoffAt: "desc" },
        take: 5,
      }),
      prisma.match.findFirst({
        where: { status: "SCHEDULED", kickoffAt: { gte: new Date() } },
        include: { homeTeam: true, awayTeam: true, league: true },
        orderBy: { kickoffAt: "asc" },
      }),
      prisma.league.count({ where: { status: "FINISHED", hidden: false } }),
    ]);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [todayCount, goalSum, spectatorSum] = await Promise.all([
    prisma.match.count({
      where: { kickoffAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) } },
    }),
    prisma.match.aggregate({
      where: { status: "FINISHED" },
      _sum: { homeScore: true, awayScore: true },
    }),
    prisma.match.aggregate({
      where: { status: "FINISHED", spectators: { not: null } },
      _sum: { spectators: true },
    }),
  ]);
  const totalGoals = (goalSum._sum.homeScore ?? 0) + (goalSum._sum.awayScore ?? 0);
  const goalsPerMatch = matchCount > 0 ? (totalGoals / matchCount).toFixed(1) : "0.0";
  const totalSpectators = spectatorSum._sum.spectators ?? 0;

  const biggestWin = recentResults
    .map((m) => ({ match: m, margin: Math.abs(m.homeScore - m.awayScore) }))
    .filter((x) => x.margin >= 3)
    .sort((a, b) => b.margin - a.margin)[0];

  const goalFest = recentResults
    .map((m) => ({ match: m, goals: m.homeScore + m.awayScore }))
    .filter((x) => x.goals >= 4)
    .sort((a, b) => b.goals - a.goals)[0];

  const recentGoals = await prisma.matchEvent.findMany({
    where: { type: "GOAL", player: { isNot: null } },
    include: { player: { include: { team: true } }, match: { include: { league: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const recentCards = await prisma.matchEvent.findMany({
    where: { type: { in: ["YELLOW_CARD", "RED_CARD"] }, player: { isNot: null } },
    include: { player: { include: { team: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const topStandings = featuredLeagues[0] ? await getCachedTopStandings(featuredLeagues[0].id) : [];
  const featuredSponsors = featuredLeagues[0]
    ? await prisma.leagueSponsor.findMany({
        where: { leagueId: featuredLeagues[0].id },
        orderBy: { createdAt: "asc" },
        take: 6,
      })
    : [];

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/", active: true },
    ...(featuredLeagues[0]
      ? [{ icon: "🏆", label: "ตารางคะแนน", href: `/leagues/${featuredLeagues[0].id}?tab=standings` }]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      {liveMatches.length > 0 && <meta httpEquiv="refresh" content="60" />}
      {liveMatches.length === 0 && recentResults.length > 0 && (
        <div className="bg-white/5 overflow-hidden border-b border-white/10">
          <div className="animate-marquee flex w-max gap-10 whitespace-nowrap px-6 py-1.5 font-display text-xs text-foreground/60">
            {[...recentResults, ...recentResults].map((m, i) => (
              <Link key={`${m.id}-r${i}`} href={`/matches/${m.id}`} className="hover:text-accent">
                ผลล่าสุด — {m.homeTeam.name} {m.homeScore}-{m.awayScore} {m.awayTeam.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {liveMatches.length > 0 && (
        <div className="bg-accent overflow-hidden">
          <div className="animate-marquee flex w-max gap-10 whitespace-nowrap px-6 py-2 font-display font-semibold text-sm text-black">
            {[...liveMatches, ...liveMatches].map((m, i) => (
              <Link key={`${m.id}-${i}`} href={`/matches/${m.id}`} className="hover:underline">
                ● LIVE — {m.homeTeam.name} {m.homeScore}-{m.awayScore} {m.awayTeam.name} (
                {m.events[0] ? computeLiveMinute(m.events[0].createdAt) : m.minute}
                &apos;)
              </Link>
            ))}
          </div>
        </div>
      )}

      {todayCount > 0 && liveMatches.length === 0 && (
        <div className="border-b border-white/10 px-6 md:px-16 py-2 text-xs text-foreground/60 flex items-center gap-2">
          📅 วันนี้มี <b className="text-foreground">{todayCount}</b> แมตช์
          <Link href="/live" className="text-accent hover:underline">
            ดูโปรแกรมสด →
          </Link>
        </div>
      )}

      <section className="relative overflow-hidden px-6 md:px-16 py-16 md:py-24 bg-gradient-to-br from-background to-[#12240F]">
        <div className="glow-blob w-96 h-96 -top-20 -right-20" />
        <div className="glow-blob w-72 h-72 bottom-0 left-1/3 opacity-60" />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(212,255,58,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(212,255,58,.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
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
            <Link
              href="/help"
              className="rounded-md px-4 py-3 font-display font-semibold text-foreground/60 hover:text-accent"
            >
              📖 วิธีใช้งาน
            </Link>
          </div>
          <div className="mt-14 flex flex-wrap gap-10">
            <Stat value={leagueCount} label="ลีกที่กำลังแข่ง" />
            <Stat value={teamCount} label="ทีมทั้งหมด" />
            <Stat value={playerCount} label="นักเตะลงทะเบียน" />
            <Stat value={matchCount} label="แมตช์ที่บันทึกผล" />
            <Stat value={liveMatches.length} label="กำลังแข่งสด" />
            <Stat value={finishedCount} label="ฤดูกาลที่จบแล้ว" />
            <div>
              <div className="font-display italic font-extrabold text-3xl text-accent">{goalsPerMatch}</div>
              <div className="text-sm text-foreground/55">ประตูเฉลี่ยต่อแมตช์</div>
            </div>
          </div>

          {finishedCount > 0 && (
            <Link
              href="/champions"
              className="mt-4 inline-block text-xs text-foreground/55 hover:text-accent"
            >
              🏆 ดูแชมป์ทั้ง {finishedCount} ฤดูกาลในหอเกียรติยศ →
            </Link>
          )}

          {nextUp && (
            <Link
              href={`/matches/${nextUp.id}`}
              className="mt-8 inline-flex items-center gap-3 rounded-xl border border-white/15 bg-card/60 px-4 py-3 text-sm hover:border-accent/50"
            >
              <span className="text-xs text-foreground/45">นัดถัดไป</span>
              <span className="font-display font-semibold">
                {nextUp.homeTeam.name} vs {nextUp.awayTeam.name}
              </span>
              <span className="text-xs text-accent">
                {nextUp.kickoffAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </Link>
          )}
        </div>
      </section>

      {recentResults.length > 0 && (
        <section className="px-6 md:px-16 py-10 border-b border-white/5">
          <h2 className="font-display italic font-extrabold text-xl text-foreground mb-5">
            ผลการแข่งขัน<span className="text-accent">ล่าสุด</span>
          </h2>
          {biggestWin && (
            <Link
              href={`/matches/${biggestWin.match.id}`}
              className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm hover:border-accent"
            >
              <span className="font-display font-bold text-accent">🔥 ผลเด็ด</span>
              <span className="font-display font-semibold">
                {biggestWin.match.homeTeam.name} {biggestWin.match.homeScore}-{biggestWin.match.awayScore}{" "}
                {biggestWin.match.awayTeam.name}
              </span>
              <span className="text-xs text-foreground/50">ชนะขาด {biggestWin.margin} ประตู · {biggestWin.match.league.name}</span>
            </Link>
          )}
          {goalFest && goalFest.match.id !== biggestWin?.match.id && (
            <Link
              href={`/matches/${goalFest.match.id}`}
              className="mb-4 ml-0 sm:ml-2 inline-flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:border-accent/50"
            >
              <span className="font-display font-bold text-foreground">⚽ มันส์สุด</span>
              <span className="font-display font-semibold">
                {goalFest.match.homeTeam.name} {goalFest.match.homeScore}-{goalFest.match.awayScore}{" "}
                {goalFest.match.awayTeam.name}
              </span>
              <span className="text-xs text-foreground/50">รวม {goalFest.goals} ประตู · {goalFest.match.league.name}</span>
            </Link>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {recentResults.map((m) => (
              <Link
                key={m.id}
                href={`/matches/${m.id}`}
                className="hover-lift rounded-xl border border-white/10 bg-card p-3 hover:border-accent/50"
              >
                <div className="text-[10px] text-foreground/40 mb-1.5">{m.league.name}</div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{m.homeTeam.name}</span>
                  <span className="font-display font-bold shrink-0">
                    {m.homeScore}-{m.awayScore}
                  </span>
                  <span className="truncate text-right">{m.awayTeam.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentGoals.length > 0 && (
        <section className="px-6 md:px-16 py-8 border-b border-white/5">
          <h2 className="font-display italic font-extrabold text-lg text-foreground mb-4">
            ผู้ทำประตู<span className="text-accent">ล่าสุด</span>
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {recentGoals.map((g) => (
              <Link
                key={g.id}
                href={`/matches/${g.matchId}`}
                className="hover-lift flex items-center gap-2 rounded-full border border-white/10 bg-card px-3.5 py-1.5 text-sm hover:border-accent/50"
              >
                <span className="text-accent">⚽</span>
                <span className="font-display font-semibold">{g.player?.name}</span>
                <span className="text-xs text-foreground/45">
                  {g.player?.team.name} · {g.minute}&apos;
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentCards.length > 0 && (
        <section className="px-6 md:px-16 py-8 border-b border-white/5">
          <h2 className="font-display italic font-extrabold text-lg text-foreground mb-4">
            ใบเตือน<span className="text-accent">ล่าสุด</span>
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {recentCards.map((c) => (
              <Link
                key={c.id}
                href={`/matches/${c.matchId}`}
                className="hover-lift flex items-center gap-2 rounded-full border border-white/10 bg-card px-3.5 py-1.5 text-sm hover:border-accent/50"
              >
                <span
                  className={`inline-block h-3.5 w-2.5 rounded-sm ${
                    c.type === "RED_CARD" ? "bg-red-500" : "bg-yellow-400"
                  }`}
                />
                <span className="font-display font-semibold">{c.player?.name}</span>
                <span className="text-xs text-foreground/45">
                  {c.player?.team.name} · {c.minute}&apos;
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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
                className="hover-lift rounded-2xl border border-white/10 bg-card overflow-hidden hover:border-accent/50"
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
                    <div className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-display font-semibold text-foreground">
                          {lg.leaderName}
                        </span>
                        <span className="text-foreground/50 text-xs">จ่าฝูง · {lg.leaderPoints} แต้ม</span>
                      </div>
                      {lg.leaderForm.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {lg.leaderForm.map((f, i) => (
                            <span
                              key={i}
                              className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center ${
                                f === "W"
                                  ? "bg-accent text-black"
                                  : f === "L"
                                    ? "bg-red-500 text-white"
                                    : "bg-white/15 text-foreground"
                              }`}
                            >
                              {f === "W" ? "ช" : f === "L" ? "พ" : "ส"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {featuredLeagues[0] && topStandings.length > 0 && (
        <section className="px-6 md:px-16 py-12 border-t border-white/5">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-display italic font-extrabold text-xl text-foreground">
              ตารางคะแนน <span className="text-accent">{featuredLeagues[0].name}</span>
            </h2>
            <Link
              href={`/leagues/${featuredLeagues[0].id}?tab=standings`}
              className="text-xs text-foreground/55 hover:text-accent"
            >
              ดูตารางเต็ม →
            </Link>
          </div>
          <div className="rounded-xl border border-white/10 bg-card overflow-hidden max-w-2xl">
            {topStandings.map((row, i) => (
              <div
                key={row.teamId}
                className="flex items-center gap-4 px-4 py-2.5 text-sm border-t border-white/5 first:border-t-0"
              >
                <span className="w-5 font-display font-bold text-foreground/50">{i + 1}</span>
                <span className="flex-1 font-display font-semibold">{row.teamName}</span>
                <span className="text-xs text-foreground/45">แข่ง {row.played}</span>
                <span className="font-display italic font-extrabold text-accent">{row.points}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="px-6 md:px-16 py-14 bg-accent">
        <h2 className="font-display italic font-extrabold text-2xl md:text-3xl text-black mb-8">
          ทุกอย่างที่ผู้จัดลีกต้องการ
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="hover-lift rounded-xl bg-background p-5">
              <div className="text-2xl text-accent mb-2">{f.icon}</div>
              <div className="font-display font-bold text-foreground mb-1">{f.title}</div>
              <div className="text-sm text-foreground/60 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {featuredSponsors.length > 0 && (
        <section className="px-6 md:px-16 py-8 border-t border-white/5 flex items-center gap-5 flex-wrap">
          <span className="text-xs text-foreground/40">ผู้สนับสนุน {featuredLeagues[0]?.name}:</span>
          {featuredSponsors.map((s) => (
            <span key={s.id} className="flex items-center gap-2 text-sm text-foreground/60">
              {s.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logoUrl} alt={s.name} className="h-7 w-7 rounded object-cover" />
              )}
              {s.name}
            </span>
          ))}
        </section>
      )}

      <footer className="px-6 md:px-16 py-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 text-sm">
        <span className="font-display italic font-bold text-foreground">
          88ARENA<span className="text-accent">LEAGUE</span>
        </span>
        <nav className="flex gap-5 text-xs text-foreground/55">
          <Link href="/live" className="hover:text-accent">
            แมตช์สด
          </Link>
          <Link href="/stats" className="hover:text-accent">
            สถิติรวม
          </Link>
          <Link href="/leagues" className="hover:text-accent">
            ลีกทั้งหมด
          </Link>
          <Link href="/search" className="hover:text-accent">
            ค้นหา
          </Link>
          <Link href="/champions" className="hover:text-accent">
            หอเกียรติยศ
          </Link>
          <Link href="/help" className="hover:text-accent">
            วิธีใช้งาน
          </Link>
          <Link href="/login" className="hover:text-accent">
            เข้าสู่ระบบ
          </Link>
        </nav>
        <span className="text-foreground/40 text-xs">
          {leagueCount} ลีก · {matchCount} แมตช์ · ⚽ {totalGoals.toLocaleString()} ประตู
          {totalSpectators > 0 && <> · 👥 {totalSpectators.toLocaleString()} ผู้ชม</>} · © 2026
          88ArenaLeague — อัปเดตล่าสุด{" "}
          {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
        </span>
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
