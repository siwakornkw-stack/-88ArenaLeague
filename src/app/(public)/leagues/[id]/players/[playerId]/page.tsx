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
  searchParams,
}: {
  params: Promise<{ id: string; playerId: string }>;
  searchParams: Promise<{ oppSort?: string }>;
}) {
  const { id, playerId } = await params;
  const { oppSort } = await searchParams;

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

  const allLineups = await prisma.matchLineup.findMany({
    where: { playerId, match: { status: { in: ["LIVE", "FINISHED"] } } },
    include: { match: { include: { homeTeam: true, awayTeam: true } } },
    orderBy: { match: { kickoffAt: "desc" } },
  });
  const recentLineups = allLineups.slice(0, 5);

  const [startingApps, assistsGiven, subbedOff, teamLeagueGoals, crowdLineups] =
    await Promise.all([
      prisma.matchLineup.count({
        where: {
          playerId,
          isStarting: true,
          match: { status: { in: ["LIVE", "FINISHED"] } },
        },
      }),
      prisma.matchEvent.count({
        where: { type: "GOAL", relatedPlayerId: playerId },
      }),
      prisma.matchEvent.count({
        where: { type: "SUBSTITUTION", relatedPlayerId: playerId },
      }),
      prisma.matchEvent.count({
        where: {
          type: "GOAL",
          match: { leagueId: id, stage: "LEAGUE" },
          player: { teamId: player.teamId },
        },
      }),
      prisma.matchLineup.findMany({
        where: {
          playerId,
          match: { status: { in: ["LIVE", "FINISHED"] }, spectators: { not: null } },
        },
        select: {
          match: {
            select: {
              spectators: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
              kickoffAt: true,
            },
          },
        },
      }),
    ]);

  const assistPartners = new Map<string, number>();
  for (const ev of events) {
    if (ev.type !== "GOAL") continue;
    const rp = (ev as { relatedPlayer?: { name: string } | null }).relatedPlayer;
    if (rp) assistPartners.set(rp.name, (assistPartners.get(rp.name) ?? 0) + 1);
  }
  const topPartners = [...assistPartners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Goals by scoreline state: reconstruct the running score at the moment
  // this player scored each of his goals.
  const scoredMatchIds = [
    ...new Set(events.filter((e) => e.type === "GOAL").map((e) => e.matchId)),
  ];
  const matchGoalTimeline = scoredMatchIds.length
    ? await prisma.matchEvent.findMany({
        where: {
          matchId: { in: scoredMatchIds },
          type: { in: ["GOAL", "OWN_GOAL"] },
        },
        select: {
          id: true,
          matchId: true,
          minute: true,
          type: true,
          side: true,
          createdAt: true,
        },
      })
    : [];
  const scorelineState = { leading: 0, level: 0, trailing: 0 };
  {
    // Order goals within each match, then walk them keeping running home/away
    // totals; when we hit one of the player's own GOAL events, classify by the
    // score BEFORE it counted (from his team's perspective).
    const byMatch = new Map<string, typeof matchGoalTimeline>();
    for (const g of matchGoalTimeline) {
      const arr = byMatch.get(g.matchId) ?? [];
      arr.push(g);
      byMatch.set(g.matchId, arr);
    }
    const myGoalIds = new Set(
      events.filter((e) => e.type === "GOAL").map((e) => e.id)
    );
    for (const [mid, arr] of byMatch) {
      arr.sort(
        (a, b) => a.minute - b.minute || a.createdAt.getTime() - b.createdAt.getTime()
      );
      const isHome = events.find((e) => e.matchId === mid)?.match.homeTeamId === player.teamId;
      let home = 0;
      let away = 0;
      for (const g of arr) {
        // OWN_GOAL counts for the opposite side of g.side.
        const scoringSide = g.type === "OWN_GOAL" ? (g.side === "HOME" ? "AWAY" : "HOME") : g.side;
        if (myGoalIds.has(g.id)) {
          const mine = isHome ? home : away;
          const theirs = isHome ? away : home;
          if (mine > theirs) scorelineState.leading++;
          else if (mine === theirs) scorelineState.level++;
          else scorelineState.trailing++;
        }
        if (scoringSide === "HOME") home++;
        else away++;
      }
    }
  }
  const scorelineTotal =
    scorelineState.leading + scorelineState.level + scorelineState.trailing;

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
          <Stat value={assistsGiven} label="แอสซิสต์" />
          <Stat value={goals + assistsGiven} label="มีส่วนร่วมประตู" />
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
                {teamLeagueGoals > 0 && (goals + assistsGiven) > 0 && (
                  <Stat
                    value={Math.round(((goals + assistsGiven) / teamLeagueGoals) * 100)}
                    label="% ประตูทีม (มีส่วนร่วม)"
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

        {scorelineTotal > 0 && (
          <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold">ประตูตามสถานการณ์สกอร์</h2>
              <span className="text-xs text-foreground/45">ณ เวลาที่ยิง</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
              {[
                { n: scorelineState.trailing, cls: "bg-red-400/70" },
                { n: scorelineState.level, cls: "bg-yellow-400/70" },
                { n: scorelineState.leading, cls: "bg-accent" },
              ].map((s, i) =>
                s.n > 0 ? (
                  <div
                    key={i}
                    className={s.cls}
                    style={{ width: `${(s.n / scorelineTotal) * 100}%` }}
                  />
                ) : null
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <div className="font-display font-bold text-red-300">
                  {scorelineState.trailing}
                </div>
                <div className="text-xs text-foreground/50">ตอนตามหลัง</div>
              </div>
              <div>
                <div className="font-display font-bold text-yellow-300">
                  {scorelineState.level}
                </div>
                <div className="text-xs text-foreground/50">ตอนเสมอ (ตีเสมอ/ขึ้นนำ)</div>
              </div>
              <div>
                <div className="font-display font-bold text-accent">
                  {scorelineState.leading}
                </div>
                <div className="text-xs text-foreground/50">ตอนนำอยู่แล้ว</div>
              </div>
            </div>
            {scorelineState.trailing + scorelineState.level > 0 && (
              <p className="mt-3 text-xs text-foreground/45">
                {Math.round(
                  ((scorelineState.trailing + scorelineState.level) / scorelineTotal) * 100
                )}
                % ของประตูยิงตอนทีมยังไม่นำ — ประตูที่มีน้ำหนักต่อผลการแข่งขัน
              </p>
            )}
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

        {apps > 0 && (
          <p className="text-sm text-foreground/60">
            ออกสตาร์ทเป็นตัวจริง <b className="text-accent">{startingApps}</b> จาก{" "}
            <b>{apps}</b> นัด ({Math.round((startingApps / apps) * 100)}%)
            {apps - startingApps > 0 && (
              <> · ลงเป็นตัวสำรอง {apps - startingApps} นัด</>
            )}
          </p>
        )}

        {(() => {
          const scoredMatchIdSet = new Set(
            events.filter((e) => e.type === "GOAL").map((e) => e.matchId)
          );
          // Walk appearances oldest -> newest, count the longest run of
          // consecutive matches in which the player scored.
          const chrono = [...allLineups].reverse();
          let best = 0;
          let cur = 0;
          let current = 0;
          for (let i = 0; i < chrono.length; i++) {
            if (scoredMatchIdSet.has(chrono[i].matchId)) {
              cur++;
              if (cur > best) best = cur;
              if (i === chrono.length - 1) current = cur;
            } else {
              cur = 0;
            }
          }
          if (best < 2) return null;
          return (
            <div className="rounded-xl border border-accent/30 bg-card p-4 text-sm max-w-md flex flex-wrap items-center gap-x-6 gap-y-2">
              <span>
                📈 ยิงต่อเนื่องสูงสุด{" "}
                <b className="font-display font-bold text-accent">{best}</b> นัดติด
              </span>
              {current >= 2 && (
                <span className="text-accent">
                  🔥 กำลังต่อสตรีค {current} นัด
                </span>
              )}
            </div>
          );
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
          const perMatch = new Map<string, number>();
          for (const e of events) {
            if (e.type !== "GOAL") continue;
            perMatch.set(e.matchId, (perMatch.get(e.matchId) ?? 0) + 1);
          }
          const hatTricks = [...perMatch.values()].filter((n) => n >= 3).length;
          const braces = [...perMatch.values()].filter((n) => n === 2).length;
          const best = Math.max(0, ...perMatch.values());
          if (braces === 0 && hatTricks === 0) return null;
          return (
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md flex flex-wrap items-center gap-4">
              {hatTricks > 0 && (
                <span>
                  ⚽⚽⚽ แฮตทริก{" "}
                  <b className="font-display font-bold text-accent">{hatTricks}</b> ครั้ง
                </span>
              )}
              {braces > 0 && (
                <span>
                  ⚽⚽ ยิงคู่{" "}
                  <b className="font-display font-bold text-accent">{braces}</b> นัด
                </span>
              )}
              <span className="text-foreground/50">
                ยิงมากสุด {best} ประตูใน 1 นัด
              </span>
            </div>
          );
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

        {(() => {
          const koGoals = events.filter(
            (e) => e.type === "GOAL" && e.match.stage !== "LEAGUE"
          );
          const koAssists = events.filter(
            (e) =>
              e.type === "GOAL" &&
              e.match.stage !== "LEAGUE" &&
              e.relatedPlayerId === playerId
          );
          const koApps = new Set(
            allLineups
              .filter((l) => l.match.stage !== "LEAGUE")
              .map((l) => l.matchId)
          ).size;
          if (koGoals.length === 0 && koApps === 0) return null;
          const finalGoals = koGoals.filter((e) => e.match.stage === "FINAL").length;
          return (
            <div className="rounded-xl border border-accent/30 bg-card p-4 text-sm max-w-md flex flex-wrap items-center gap-x-6 gap-y-2">
              🏆
              <span>
                รอบเพลย์ออฟ: ลงสนาม{" "}
                <b className="font-display font-bold text-accent">{koApps}</b> นัด
              </span>
              {koGoals.length > 0 && (
                <span>
                  ยิง{" "}
                  <b className="font-display font-bold text-accent">
                    {koGoals.length}
                  </b>{" "}
                  ประตู
                </span>
              )}
              {koAssists.length > 0 && (
                <span className="text-foreground/60">
                  แอสซิสต์ {koAssists.length} ครั้ง
                </span>
              )}
              {finalGoals > 0 && (
                <span className="text-accent">⭐ ยิงในนัดชิงชนะเลิศ {finalGoals} ประตู</span>
              )}
            </div>
          );
        })()}

        {(() => {
          const leagueGoalEvents = events
            .filter((e) => e.type === "GOAL" && e.match.stage === "LEAGUE")
            .slice()
            .reverse();
          const MILESTONES = [1, 5, 10, 25, 50, 100];
          const reached = MILESTONES.filter((m) => m <= leagueGoalEvents.length).map(
            (m) => ({ n: m, ev: leagueGoalEvents[m - 1] })
          );
          if (reached.length === 0) return null;
          const nextMilestone = MILESTONES.find((m) => m > leagueGoalEvents.length);
          return (
            <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
              <h2 className="font-display font-bold mb-3">หมุดหมายการยิงประตู (ลีก)</h2>
              <div className="flex flex-col gap-2">
                {reached.map(({ n, ev }) => (
                  <Link
                    key={n}
                    href={`/matches/${ev.matchId}`}
                    className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                  >
                    <span className="w-14 font-display italic font-black text-accent">
                      #{n}
                    </span>
                    <span className="flex-1 truncate">
                      {ev.match.homeTeam.name} พบ {ev.match.awayTeam.name}
                    </span>
                    <span className="text-xs text-foreground/45">
                      {ev.match.kickoffAt.toLocaleDateString("th-TH", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </Link>
                ))}
              </div>
              {nextMilestone && (
                <p className="mt-3 text-xs text-foreground/45">
                  อีก {nextMilestone - leagueGoalEvents.length} ประตูถึงหมุดหมาย{" "}
                  {nextMilestone} ลูก
                </p>
              )}
            </div>
          );
        })()}

        {(() => {
          const withCrowd = crowdLineups
            .map((l) => l.match)
            .filter((m): m is typeof m & { spectators: number } => m.spectators != null);
          if (withCrowd.length === 0) return null;
          const total = withCrowd.reduce((s, m) => s + m.spectators, 0);
          const biggest = withCrowd.reduce((a, b) => (b.spectators > a.spectators ? b : a));
          return (
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md flex flex-wrap items-center gap-x-6 gap-y-2">
              <span>
                👥 ผู้ชมรวมที่ลงเล่นต่อหน้า{" "}
                <b className="font-display font-bold text-accent">
                  {total.toLocaleString("th-TH")}
                </b>{" "}
                คน
              </span>
              <span className="text-foreground/60">
                นัดผู้ชมมากสุด {biggest.homeTeam.name} พบ {biggest.awayTeam.name}{" "}
                <b className="text-foreground/80">
                  {biggest.spectators.toLocaleString("th-TH")}
                </b>{" "}
                คน
              </span>
            </div>
          );
        })()}

        {(() => {
          const subbedOn = events.filter(
            (e) => e.type === "SUBSTITUTION" && e.playerId === playerId
          ).length;
          if (subbedOn === 0 && subbedOff === 0) return null;
          const goalsAsSub = events.filter((e) => {
            if (e.type !== "GOAL") return false;
            return events.some(
              (s) =>
                s.type === "SUBSTITUTION" &&
                s.matchId === e.matchId &&
                s.playerId === playerId &&
                s.minute <= e.minute
            );
          }).length;
          return (
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm max-w-md flex flex-wrap items-center gap-x-6 gap-y-2">
              🔄
              {subbedOn > 0 && (
                <span>
                  ลงเป็นตัวสำรอง{" "}
                  <b className="font-display font-bold text-accent">{subbedOn}</b> ครั้ง
                </span>
              )}
              {subbedOff > 0 && (
                <span>
                  ถูกเปลี่ยนออก{" "}
                  <b className="font-display font-bold text-accent">{subbedOff}</b> ครั้ง
                </span>
              )}
              {goalsAsSub > 0 && (
                <span className="text-foreground/60">
                  ยิงหลังลงมาเป็นตัวสำรอง {goalsAsSub} ประตู
                </span>
              )}
            </div>
          );
        })()}

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

        {(() => {
          type Split = {
            key: string;
            label: string;
            apps: number;
            goals: number;
            assists: number;
            cards: number;
          };
          const stageOf = (s: string) => (s === "LEAGUE" ? "LEAGUE" : "PLAYOFF");
          const splits: Record<string, Split> = {
            LEAGUE: { key: "LEAGUE", label: "ลีก", apps: 0, goals: 0, assists: 0, cards: 0 },
            PLAYOFF: {
              key: "PLAYOFF",
              label: "เพลย์ออฟ",
              apps: 0,
              goals: 0,
              assists: 0,
              cards: 0,
            },
          };
          for (const l of allLineups) splits[stageOf(l.match.stage)].apps++;
          for (const e of events) {
            const bucket = splits[stageOf(e.match.stage)];
            if (e.type === "GOAL") {
              if (e.playerId === playerId) bucket.goals++;
              if (e.relatedPlayerId === playerId) bucket.assists++;
            }
            if (
              (e.type === "YELLOW_CARD" || e.type === "RED_CARD") &&
              e.playerId === playerId
            )
              bucket.cards++;
          }
          // Only worth showing once the player has actually featured in a playoff;
          // otherwise the table just repeats the season totals above.
          if (splits.PLAYOFF.apps === 0 && splits.PLAYOFF.goals === 0) return null;
          const list = [splits.LEAGUE, splits.PLAYOFF];
          return (
            <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
              <h2 className="font-display font-bold mb-3">สถิติแยกตามรอบ</h2>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 gap-y-1.5 text-sm">
                <span className="text-xs text-foreground/40">รอบ</span>
                <span className="text-xs text-foreground/40 text-right">นัด</span>
                <span className="text-xs text-foreground/40 text-right">ประตู</span>
                <span className="text-xs text-foreground/40 text-right">แอสซิสต์</span>
                <span className="text-xs text-foreground/40 text-right">ใบเตือน</span>
                {list.map((r) => (
                  <div key={r.key} className="contents">
                    <span
                      className={r.key === "PLAYOFF" ? "text-accent" : undefined}
                    >
                      {r.label}
                    </span>
                    <span className="text-right text-foreground/60">{r.apps}</span>
                    <span className="text-right font-display font-bold text-accent">
                      {r.goals || "-"}
                    </span>
                    <span className="text-right text-foreground/70">
                      {r.assists || "-"}
                    </span>
                    <span className="text-right text-foreground/60">
                      {r.cards || "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {(() => {
          type Row = { name: string; apps: number; goals: number; assists: number };
          const rows = new Map<string, Row>();
          const oppName = (m: {
            homeTeamId: string;
            homeTeam: { name: string };
            awayTeam: { name: string };
          }) => (m.homeTeamId === player.teamId ? m.awayTeam.name : m.homeTeam.name);
          for (const l of allLineups) {
            const name = oppName(l.match);
            const r = rows.get(name) ?? { name, apps: 0, goals: 0, assists: 0 };
            r.apps++;
            rows.set(name, r);
          }
          for (const e of events) {
            if (e.type !== "GOAL") continue;
            const name = oppName(e.match);
            const r = rows.get(name) ?? { name, apps: 0, goals: 0, assists: 0 };
            if (e.playerId === playerId) r.goals++;
            if (e.relatedPlayerId === playerId) r.assists++;
            rows.set(name, r);
          }
          if (rows.size === 0) return null;
          const sortKey =
            oppSort === "apps" || oppSort === "assists" || oppSort === "name"
              ? oppSort
              : "goals";
          const list = [...rows.values()].sort((a, b) =>
            sortKey === "name"
              ? a.name.localeCompare(b.name, "th")
              : b[sortKey] - a[sortKey] || b.goals - a.goals
          );
          const SortHead = ({ k, label }: { k: string; label: string }) => (
            <a
              href={`?oppSort=${k}`}
              className={`hover:text-accent ${sortKey === k ? "text-accent" : ""}`}
            >
              {label}
              {sortKey === k ? " ▾" : ""}
            </a>
          );
          return (
            <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-bold">สถิติแยกตามคู่แข่ง</h2>
                <div className="flex gap-3 text-xs text-foreground/50">
                  เรียง: <SortHead k="goals" label="ประตู" />
                  <SortHead k="assists" label="แอสซิสต์" />
                  <SortHead k="apps" label="นัด" />
                  <SortHead k="name" label="ชื่อ" />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 text-sm">
                <span className="text-xs text-foreground/40">คู่แข่ง</span>
                <span className="text-xs text-foreground/40 text-right">นัด</span>
                <span className="text-xs text-foreground/40 text-right">ประตู</span>
                <span className="text-xs text-foreground/40 text-right">แอสซิสต์</span>
                {list.map((r) => (
                  <div key={r.name} className="contents">
                    <span className="truncate">{r.name}</span>
                    <span className="text-right text-foreground/60">{r.apps}</span>
                    <span className="text-right font-display font-bold text-accent">
                      {r.goals || "-"}
                    </span>
                    <span className="text-right text-foreground/70">
                      {r.assists || "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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
