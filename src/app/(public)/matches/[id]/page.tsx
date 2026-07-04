import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { computeStandings } from "@/lib/standings";
import { MatchTimeline } from "@/components/match-timeline";
import { MobileNav } from "@/components/mobile-nav";
import { unstable_cache } from "next/cache";

const getCachedStandings = unstable_cache(
  (leagueId: string) => computeStandings(leagueId),
  ["match-standings"],
  { revalidate: 30 }
);

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "ยังไม่เริ่ม",
  LIVE: "กำลังแข่งขัน",
  FINISHED: "จบการแข่งขัน",
};

const STAT_FIELDS = [
  { key: "Possession", label: "ครองบอล %" },
  { key: "Shots", label: "ยิงทั้งหมด" },
  { key: "ShotsOnTarget", label: "ยิงเข้ากรอบ" },
  { key: "Corners", label: "เตะมุม" },
  { key: "Fouls", label: "ฟาวล์" },
] as const;

export default async function PublicMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      league: true,
      homeTeam: { include: { players: true } },
      awayTeam: { include: { players: true } },
      events: {
        orderBy: [{ minute: "asc" }, { createdAt: "asc" }],
        include: { player: true, relatedPlayer: true },
      },
      lineups: { include: { player: true } },
    },
  });
  if (!match) notFound();

  const homeLineupPlayers = match.lineups
    .filter((l) => l.isStarting && match.homeTeam.players.some((p) => p.id === l.playerId))
    .map((l) => l.player);
  const awayLineupPlayers = match.lineups
    .filter((l) => l.isStarting && match.awayTeam.players.some((p) => p.id === l.playerId))
    .map((l) => l.player);

  const homePlayers = homeLineupPlayers.length > 0 ? homeLineupPlayers : match.homeTeam.players;
  const awayPlayers = awayLineupPlayers.length > 0 ? awayLineupPlayers : match.awayTeam.players;

  const kickOffEvent = match.events.find((e) => e.type === "KICK_OFF");
  const liveMinute =
    match.status === "LIVE" && kickOffEvent ? computeLiveMinute(kickOffEvent.createdAt) : match.minute;

  const standings = await getCachedStandings(match.leagueId);
  const homeRank = standings.findIndex((r) => r.teamId === match.homeTeamId) + 1;
  const awayRank = standings.findIndex((r) => r.teamId === match.awayTeamId) + 1;

  const h2h = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      id: { not: match.id },
      OR: [
        { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
        { homeTeamId: match.awayTeamId, awayTeamId: match.homeTeamId },
      ],
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "desc" },
    take: 5,
  });
  let h2hHomeWins = 0;
  let h2hDraws = 0;
  let h2hAwayWins = 0;
  for (const m of h2h) {
    const homeGoals = m.homeTeamId === match.homeTeamId ? m.homeScore : m.awayScore;
    const awayGoals = m.homeTeamId === match.homeTeamId ? m.awayScore : m.homeScore;
    if (homeGoals > awayGoals) h2hHomeWins++;
    else if (homeGoals < awayGoals) h2hAwayWins++;
    else h2hDraws++;
  }

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ตาราง", href: `/leagues/${match.leagueId}?tab=standings` },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 md:px-16 py-4 text-sm">
        <Link href={`/leagues/${match.leagueId}`} className="text-foreground/60 hover:text-accent">
          ← {match.league.name}
        </Link>
      </div>

      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-10">
        <div className="flex items-center justify-center gap-3 text-xs font-display font-semibold mb-4">
          {match.status === "LIVE" ? (
            <span className="flex items-center gap-1 text-accent">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> LIVE {liveMinute}&apos;
            </span>
          ) : (
            <span className="text-foreground/50">{STATUS_LABEL[match.status]}</span>
          )}
        </div>
        <div className="flex items-center justify-center gap-6 md:gap-14">
          <div className="flex-1 text-right">
            <div className="font-display font-bold text-lg md:text-2xl text-foreground">
              {match.homeTeam.name}
            </div>
            <div className="text-xs text-foreground/50">
              {homeRank > 0 && `อันดับ ${homeRank} · `}เหย้า
            </div>
          </div>
          <span className="font-display font-black text-4xl md:text-6xl text-foreground shrink-0">
            {match.status === "SCHEDULED" ? "vs" : `${match.homeScore} - ${match.awayScore}`}
          </span>
          <div className="flex-1">
            <div className="font-display font-bold text-lg md:text-2xl text-foreground">
              {match.awayTeam.name}
            </div>
            <div className="text-xs text-foreground/50">
              {awayRank > 0 && `อันดับ ${awayRank} · `}เยือน
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-foreground/45">
          นัดที่ {match.round} ·{" "}
          {match.kickoffAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
          {match.venue && <> · {match.venue}</>}
        </p>
      </div>

      <div className="px-6 md:px-16 py-10 flex-1 space-y-10">
        {match.status !== "SCHEDULED" && (
          <div>
            <h2 className="font-display font-bold mb-4">สถิติแมตช์</h2>
            <div className="rounded-xl border border-white/10 bg-card p-5 space-y-4">
              {STAT_FIELDS.map((f) => {
                const home = match[`home${f.key}` as keyof typeof match] as number;
                const away = match[`away${f.key}` as keyof typeof match] as number;
                const total = home + away || 1;
                return (
                  <div key={f.key} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-display font-semibold">{home}</span>
                      <span className="text-foreground/50 text-xs">{f.label}</span>
                      <span className="font-display font-semibold">{away}</span>
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10">
                      <div className="bg-accent" style={{ width: `${(home / total) * 100}%` }} />
                      <div className="bg-white/30" style={{ width: `${(away / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {h2h.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-4">ผลเจอกันล่าสุด</h2>
            <div className="rounded-xl border border-white/10 bg-card p-5 space-y-4">
              <div className="flex justify-center gap-8 text-center text-sm">
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">
                    {h2hHomeWins}
                  </div>
                  <div className="text-xs text-foreground/50">{match.homeTeam.name} ชนะ</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-foreground/70">
                    {h2hDraws}
                  </div>
                  <div className="text-xs text-foreground/50">เสมอ</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">
                    {h2hAwayWins}
                  </div>
                  <div className="text-xs text-foreground/50">{match.awayTeam.name} ชนะ</div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {h2h.map((m) => (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="grid grid-cols-[1fr_56px_1fr] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                  >
                    <span className="text-right">{m.homeTeam.name}</span>
                    <span className="text-center font-display font-bold">
                      {m.homeScore}-{m.awayScore}
                    </span>
                    <span>{m.awayTeam.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="font-display font-bold mb-4">ไทม์ไลน์</h2>
          <div className="rounded-xl border border-white/10 bg-card p-5">
            <MatchTimeline events={match.events} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LineupCard teamName={match.homeTeam.name} players={homePlayers} />
          <LineupCard teamName={match.awayTeam.name} players={awayPlayers} />
        </div>
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}

function LineupCard({
  teamName,
  players,
}: {
  teamName: string;
  players: { id: string; name: string; number: number }[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <h3 className="font-display font-bold mb-3">{teamName}</h3>
      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-3 text-sm">
            <span className="w-6 text-foreground/45 font-display font-bold">{p.number}</span>
            <span>{p.name}</span>
          </div>
        ))}
        {players.length === 0 && <p className="text-foreground/50 text-sm">ยังไม่มีรายชื่อผู้เล่น</p>}
      </div>
    </div>
  );
}
