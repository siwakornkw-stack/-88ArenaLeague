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
      include: {
        match: { include: { homeTeam: true, awayTeam: true } },
        relatedPlayer: true,
      },
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

  const assistPartners = new Map<string, number>();
  for (const ev of events) {
    if (ev.type !== "GOAL") continue;
    const rp = (ev as { relatedPlayer?: { name: string } | null }).relatedPlayer;
    if (rp) assistPartners.set(rp.name, (assistPartners.get(rp.name) ?? 0) + 1);
  }
  const topPartners = [...assistPartners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const POSITION_COLOR: Record<string, string> = {
    GK: "bg-yellow-400/15 text-yellow-400",
    DF: "bg-blue-400/15 text-blue-300",
    MF: "bg-emerald-400/15 text-emerald-300",
    FW: "bg-red-400/15 text-red-300",
  };
  const posKey = player.position.toUpperCase().includes("GK") || player.position.includes("ผู้รักษา")
    ? "GK"
    : player.position.toUpperCase().includes("DF") || player.position.includes("กองหลัง")
      ? "DF"
      : player.position.toUpperCase().includes("FW") || player.position.includes("กองหน้า") || player.position.includes("ปีก")
        ? "FW"
        : "MF";

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

  const scorerRank =
    goals > 0
      ? (
          await prisma.matchEvent.groupBy({
            by: ["playerId"],
            where: { type: "GOAL", playerId: { not: null }, match: { leagueId: id } },
            _count: { playerId: true },
          })
        ).filter((g) => g._count.playerId > goals).length + 1
      : null;

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
            {player.nickname && (
              <span className="text-foreground/50 text-xl md:text-2xl"> ({player.nickname})</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-foreground/55 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${POSITION_COLOR[posKey]}`}>
              {player.position}
            </span>
            {player.team.name} · {player.team.league.name}
            {player.birthYear && <> · อายุ {new Date().getFullYear() - player.birthYear} ปี</>}
            {player.heightCm && <> · {player.heightCm} ซม.</>}
            {player.weightKg && <> · {player.weightKg} กก.</>}
            {scorerRank && scorerRank <= 10 && (
              <span className="text-accent"> · ดาวซัลโวอันดับ {scorerRank} ของลีก</span>
            )}
          </p>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {(() => {
              const lastTwoMatchIds = [...new Set(events.map((e) => e.matchId))].slice(0, 2);
              const hot =
                lastTwoMatchIds.length === 2 &&
                lastTwoMatchIds.every((mid) =>
                  events.some((e) => e.matchId === mid && e.type === "GOAL")
                );
              return hot ? (
                <span className="text-xs rounded-full bg-accent/15 text-accent px-3 py-1">
                  🔥 ฟอร์มร้อน — ยิง 2 นัดติด
                </span>
              ) : null;
            })()}
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
            <Link
              href={`/leagues/${id}/players/compare?a=${playerId}`}
              className="text-xs text-foreground/60 hover:text-accent"
            >
              ⚖ เทียบกับนักเตะอื่น
            </Link>
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
          {(() => {
            const goalEvents = events.filter((e) => e.type === "GOAL");
            const homeGoals = goalEvents.filter(
              (e) => e.match.homeTeamId === player.teamId
            ).length;
            return (
              <>
                <Stat value={homeGoals} label="ประตูเหย้า" />
                <Stat value={goalEvents.length - homeGoals} label="ประตูเยือน" />
                {goalEvents.length > 0 && (
                  <Stat
                    value={Math.round(
                      goalEvents.reduce((s, e) => s + e.minute, 0) / goalEvents.length
                    )}
                    label="นาทีเฉลี่ยที่ยิง"
                  />
                )}
              </>
            );
          })()}
        </div>

        {goals >= 2 && (
          <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
            <h2 className="font-display font-bold mb-3">ช่วงเวลาที่ยิงประตู (นาที)</h2>
            <GoalsBarChart rounds={MINUTE_BUCKETS} values={goalBuckets} />
          </div>
        )}

        {(() => {
          const goalEvents = events.filter((e) => e.type === "GOAL");
          const winWhenScores = goalEvents.filter((e) => {
            const isHome = e.match.homeTeamId === player.teamId;
            return isHome
              ? e.match.homeScore > e.match.awayScore
              : e.match.awayScore > e.match.homeScore;
          });
          const uniqueWinMatches = new Set(winWhenScores.map((e) => e.matchId)).size;
          const uniqueScoreMatches = new Set(goalEvents.map((e) => e.matchId)).size;
          return uniqueScoreMatches > 0 ? (
            <p className="text-sm text-foreground/60">
              ทีมชนะ <b className="text-accent">{uniqueWinMatches}</b> จาก{" "}
              <b>{uniqueScoreMatches}</b> นัดที่เขายิงประตู (
              {Math.round((uniqueWinMatches / uniqueScoreMatches) * 100)}%)
            </p>
          ) : null;
        })()}

        {(() => {
          const victims = new Map<string, number>();
          for (const e of events) {
            if (e.type !== "GOAL") continue;
            const opp =
              e.match.homeTeamId === player.teamId ? e.match.awayTeam.name : e.match.homeTeam.name;
            victims.set(opp, (victims.get(opp) ?? 0) + 1);
          }
          const fav = [...victims.entries()].sort((a, b) => b[1] - a[1])[0];
          return fav && fav[1] >= 2 ? (
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md">
              🎯 คู่แข่งที่ยิงบ่อยสุด: <b className="font-display">{fav[0]}</b>{" "}
              <span className="text-accent font-display font-bold">{fav[1]} ประตู</span>
            </div>
          ) : null;
        })()}

        {(() => {
          const venues = new Map<string, number>();
          for (const e of events) {
            if (e.type !== "GOAL" || !e.match.venue) continue;
            venues.set(e.match.venue, (venues.get(e.match.venue) ?? 0) + 1);
          }
          const fav = [...venues.entries()].sort((a, b) => b[1] - a[1])[0];
          return fav && fav[1] >= 2 ? (
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md">
              🏟 สนามที่ยิงบ่อยสุด: <b className="font-display">{fav[0]}</b>{" "}
              <span className="text-accent font-display font-bold">{fav[1]} ประตู</span>
            </div>
          ) : null;
        })()}

        {(() => {
          const goalEvents = events.filter((e) => e.type === "GOAL");
          if (goalEvents.length < 2) return null;
          const first = goalEvents[goalEvents.length - 1];
          const last = goalEvents[0];
          const fmt = (d: Date) => d.toLocaleDateString("th-TH", { dateStyle: "medium" });
          return (
            <p className="text-xs text-foreground/45">
              ⚽ ประตูแรกในลีก {fmt(first.match.kickoffAt)} · ประตูล่าสุด{" "}
              {fmt(last.match.kickoffAt)}
            </p>
          );
        })()}

        {apps >= 3 && yellows === 0 && reds === 0 && (
          <div className="rounded-xl border border-accent/30 bg-card p-4 text-sm max-w-md">
            😇 <b className="font-display">ประวัติขาวสะอาด</b> — ลงสนาม {apps} นัด
            ไม่เคยโดนใบเหลือง-แดง
          </div>
        )}

        {topPartners.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md">
            <div className="text-xs text-foreground/50 mb-2">🤝 คู่หูแอสซิสต์ให้บ่อยสุด</div>
            <div className="space-y-1">
              {topPartners.map(([name, count], i) => (
                <div key={name} className="flex items-center justify-between">
                  <span>
                    <span className="text-foreground/40 mr-2">{i + 1}</span>
                    {name}
                  </span>
                  <span className="font-display font-bold text-accent">{count}</span>
                </div>
              ))}
            </div>
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
