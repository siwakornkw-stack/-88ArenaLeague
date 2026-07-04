import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EVENT_ICON } from "@/lib/matchEvents";
import { MobileNav } from "@/components/mobile-nav";

export default async function PublicPlayerPage({
  params,
}: {
  params: Promise<{ id: string; playerId: string }>;
}) {
  const { id, playerId } = await params;

  const player = await prisma.player.findFirst({
    where: { id: playerId, team: { leagueId: id } },
    include: { team: { include: { league: true } } },
  });
  if (!player) notFound();

  const [apps, events] = await Promise.all([
    prisma.matchLineup.count({
      where: { playerId, match: { status: { in: ["LIVE", "FINISHED"] } } },
    }),
    prisma.matchEvent.findMany({
      where: { playerId },
      include: { match: { include: { homeTeam: true, awayTeam: true } } },
      orderBy: [{ match: { kickoffAt: "desc" } }, { minute: "asc" }],
    }),
  ]);

  const goals = events.filter((e) => e.type === "GOAL").length;
  const yellows = events.filter((e) => e.type === "YELLOW_CARD").length;
  const reds = events.filter((e) => e.type === "RED_CARD").length;

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ตาราง", href: `/leagues/${id}?tab=standings` },
    { icon: "👥", label: "ทีม", href: `/leagues/${id}/teams/${player.teamId}`, active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 md:px-16 py-4 text-sm">
        <Link
          href={`/leagues/${id}/teams/${player.teamId}`}
          className="text-foreground/60 hover:text-accent"
        >
          ← {player.team.name}
        </Link>
      </div>

      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8 flex items-center gap-5">
        {player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photoUrl}
            alt={player.name}
            className="w-16 h-16 rounded-full shrink-0 object-cover border-2 border-white/20"
          />
        ) : (
          <span
            className="w-16 h-16 rounded-full shrink-0 grid place-items-center font-display italic font-black text-2xl border-2 border-white/20"
            style={{ backgroundColor: player.team.color }}
          >
            {player.number}
          </span>
        )}
        <div>
          <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
            {player.name}
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            {player.position} · {player.team.name} · {player.team.league.name}
          </p>
        </div>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-8">
        <div className="flex flex-wrap gap-8 rounded-xl border border-white/10 bg-card p-5 text-sm">
          <Stat value={apps} label="ลงสนาม" />
          <Stat value={goals} label="ประตู" />
          <Stat value={yellows} label="ใบเหลือง" />
          <Stat value={reds} label="ใบแดง" />
        </div>

        <div className="rounded-xl border border-white/10 bg-card p-5">
          <h2 className="font-display font-bold mb-3">เหตุการณ์ในสนาม</h2>
          <div className="flex flex-col gap-2">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/matches/${ev.matchId}`}
                className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <span className="text-base">{EVENT_ICON[ev.type]}</span>
                <span className="w-10 text-foreground/50">{ev.minute}&apos;</span>
                <span className="flex-1">
                  {ev.match.homeTeam.name} {ev.match.homeScore}-{ev.match.awayScore}{" "}
                  {ev.match.awayTeam.name}
                </span>
                <span className="text-xs text-foreground/45">
                  {ev.match.kickoffAt.toLocaleDateString("th-TH", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </Link>
            ))}
            {events.length === 0 && (
              <p className="text-foreground/50 text-sm">ยังไม่มีเหตุการณ์ที่บันทึก</p>
            )}
          </div>
        </div>
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-display italic font-extrabold text-2xl text-accent">{value}</div>
      <div className="text-xs text-foreground/55">{label}</div>
    </div>
  );
}
