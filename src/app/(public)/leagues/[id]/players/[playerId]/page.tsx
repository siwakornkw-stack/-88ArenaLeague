import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { EVENT_ICON } from "@/lib/matchEvents";
import { GoalsBarChart } from "@/components/league-charts";
import { ShareLinks } from "@/components/share-links";
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

  const [apps, events, mvpCount] = await Promise.all([
    prisma.matchLineup.count({
      where: { playerId, match: { status: { in: ["LIVE", "FINISHED"] } } },
    }),
    prisma.matchEvent.findMany({
      where: { playerId },
      include: { match: { include: { homeTeam: true, awayTeam: true } } },
      orderBy: [{ match: { kickoffAt: "desc" } }, { minute: "asc" }],
    }),
    prisma.match.count({ where: { mvpPlayerId: playerId } }),
  ]);

  const recentLineups = await prisma.matchLineup.findMany({
    where: { playerId, match: { status: { in: ["LIVE", "FINISHED"] } } },
    include: { match: { include: { homeTeam: true, awayTeam: true } } },
    orderBy: { match: { kickoffAt: "desc" } },
    take: 5,
  });

  const MINUTE_BUCKETS = ["1-15", "16-30", "31-45", "46-60", "61-75", "76+"];
  const goalBuckets = [0, 0, 0, 0, 0, 0];
  for (const ev of events) {
    if (ev.type !== "GOAL") continue;
    const idx = Math.min(5, Math.floor(Math.max(0, ev.minute - 1) / 15));
    goalBuckets[idx]++;
  }

  const goals = events.filter((e) => e.type === "GOAL").length;
  const yellows = events.filter((e) => e.type === "YELLOW_CARD").length;
  const reds = events.filter((e) => e.type === "RED_CARD").length;

  const h = await headers();
  const pageUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "league-manager-app.vercel.app"}/leagues/${id}/players/${playerId}`;

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

      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8 flex items-center gap-5">
        <div className="glow-blob w-72 h-72 -top-20 right-10" />
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
          <div className="mt-2 flex items-center gap-3">
            {player.status === "BANNED" && (
              <span className="text-xs rounded-full bg-red-500/10 text-red-400 px-3 py-1">
                ⛔ ติดโทษแบน
              </span>
            )}
            {player.status === "INJURED" && (
              <span className="text-xs rounded-full bg-yellow-400/10 text-yellow-400 px-3 py-1">
                🩹 บาดเจ็บ
              </span>
            )}
            {player.status === "ACTIVE" && yellows >= 3 && (
              <span className="text-xs rounded-full bg-yellow-400/10 text-yellow-400 px-3 py-1">
                ⚠ ใบเหลืองสะสม {yellows} — เสี่ยงโดนแบน
              </span>
            )}
            <ShareLinks url={pageUrl} text={`${player.name} · ${player.team.name}`} />
          </div>
        </div>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-8">
        <div className="flex flex-wrap gap-8 rounded-xl border border-white/10 bg-card p-5 text-sm">
          <Stat value={apps} label="ลงสนาม" />
          <Stat value={goals} label="ประตู" />
          <Stat value={yellows} label="ใบเหลือง" />
          <Stat value={reds} label="ใบแดง" />
          <Stat value={mvpCount} label="MVP" />
          <Stat value={apps > 0 ? Number((goals / apps).toFixed(2)) : 0} label="ประตู/นัด" />
        </div>

        {goals >= 2 && (
          <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
            <h2 className="font-display font-bold mb-3">ช่วงเวลาที่ยิงประตู (นาที)</h2>
            <GoalsBarChart rounds={MINUTE_BUCKETS} values={goalBuckets} />
          </div>
        )}

        {recentLineups.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
            <h2 className="font-display font-bold mb-3">ลงสนามล่าสุด</h2>
            <div className="flex flex-col gap-2">
              {recentLineups.map((l) => (
                <Link
                  key={l.id}
                  href={`/matches/${l.matchId}`}
                  className="grid grid-cols-[1fr_56px_1fr_auto] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  <span className="text-right truncate">{l.match.homeTeam.name}</span>
                  <span className="text-center font-display font-bold">
                    {l.match.homeScore}-{l.match.awayScore}
                  </span>
                  <span className="truncate">{l.match.awayTeam.name}</span>
                  <span className="text-xs text-foreground/40">
                    {l.isStarting ? "ตัวจริง" : "สำรอง"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

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
