import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EVENT_ICON } from "@/lib/matchEvents";
import { MobileNav } from "@/components/mobile-nav";

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
      events: { orderBy: [{ minute: "asc" }, { createdAt: "asc" }] },
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
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> LIVE {match.minute}&apos;
            </span>
          ) : (
            <span className="text-foreground/50">{STATUS_LABEL[match.status]}</span>
          )}
        </div>
        <div className="flex items-center justify-center gap-6 md:gap-14">
          <span className="flex-1 text-right font-display font-bold text-lg md:text-2xl text-foreground">
            {match.homeTeam.name}
          </span>
          <span className="font-display font-black text-4xl md:text-6xl text-foreground shrink-0">
            {match.status === "SCHEDULED" ? "vs" : `${match.homeScore} - ${match.awayScore}`}
          </span>
          <span className="flex-1 font-display font-bold text-lg md:text-2xl text-foreground">
            {match.awayTeam.name}
          </span>
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

        <div>
          <h2 className="font-display font-bold mb-4">ไทม์ไลน์</h2>
          <div className="rounded-xl border border-white/10 bg-card p-5 space-y-3">
            {match.events.map((event) => (
              <div key={event.id} className="flex items-center gap-3 text-sm">
                <span className="text-foreground/50 w-10">{event.minute}&apos;</span>
                <span>{EVENT_ICON[event.type]}</span>
                <span>{event.label}</span>
              </div>
            ))}
            {match.events.length === 0 && (
              <p className="text-foreground/50 text-sm">ยังไม่มีเหตุการณ์</p>
            )}
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
