import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { computeStandings } from "@/lib/standings";
import { buildMatchSummary } from "@/lib/matchSummary";
import { MatchTimeline } from "@/components/match-timeline";
import { headers } from "next/headers";
import { PitchView } from "@/components/pitch-view";
import { ShareLinks } from "@/components/share-links";
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

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

const STAT_FIELDS = [
  { key: "Possession", label: "ครองบอล %" },
  { key: "Shots", label: "ยิงทั้งหมด" },
  { key: "ShotsOnTarget", label: "ยิงเข้ากรอบ" },
  { key: "Corners", label: "เตะมุม" },
  { key: "Fouls", label: "ฟาวล์" },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true, league: true },
  });
  if (!match) return {};
  const score =
    match.status === "SCHEDULED" ? "vs" : `${match.homeScore}-${match.awayScore}`;
  const title = `${match.homeTeam.name} ${score} ${match.awayTeam.name} · ${match.league.name}`;
  const description =
    match.status === "LIVE"
      ? `กำลังแข่งขันสด · ${match.league.name} นัดที่ ${match.round}`
      : match.status === "FINISHED"
        ? `ผลการแข่งขัน · ${match.league.name} นัดที่ ${match.round}`
        : `${match.kickoffAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · ${match.league.name}`;
  return {
    title,
    description,
    openGraph: { title, description },
    alternates: { canonical: `https://league-manager-app.vercel.app/matches/${id}` },
  };
}

export default async function PublicMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ events?: string }>;
}) {
  const { id } = await params;
  const { events: eventsFilter } = await searchParams;
  const goalsOnly = eventsFilter === "goals";

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
      mvpPlayer: true,
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

  const homeBench = match.lineups
    .filter((l) => !l.isStarting && match.homeTeam.players.some((p) => p.id === l.playerId))
    .map((l) => l.player);
  const awayBench = match.lineups
    .filter((l) => !l.isStarting && match.awayTeam.players.some((p) => p.id === l.playerId))
    .map((l) => l.player);

  const h = await headers();
  const pageUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "league-manager-app.vercel.app"}/matches/${id}`;

  const kickOffEvent = match.events.find((e) => e.type === "KICK_OFF");
  const liveMinute =
    match.status === "LIVE" && kickOffEvent ? computeLiveMinute(kickOffEvent.createdAt) : match.minute;
  const hasHalfTime = match.events.some((e) => e.type === "HALF_TIME");

  const siblings = await prisma.match.findMany({
    where: { leagueId: match.leagueId },
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const sibIdx = siblings.findIndex((m) => m.id === id);
  const prevId = sibIdx > 0 ? siblings[sibIdx - 1].id : null;
  const nextId = sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1].id : null;

  const dayStart = new Date(match.kickoffAt);
  dayStart.setHours(0, 0, 0, 0);
  const sameDayMatches = await prisma.match.findMany({
    where: {
      id: { not: id },
      kickoffAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) },
    },
    include: { homeTeam: true, awayTeam: true, league: true },
    orderBy: { kickoffAt: "asc" },
    take: 4,
  });

  const goalCount = match.events.filter((e) => e.type === "GOAL" || e.type === "OWN_GOAL").length;
  const yellowCount = match.events.filter((e) => e.type === "YELLOW_CARD").length;
  const redCount = match.events.filter((e) => e.type === "RED_CARD").length;

  const standings = await getCachedStandings(match.leagueId);
  const homeRank = standings.findIndex((r) => r.teamId === match.homeTeamId) + 1;
  const awayRank = standings.findIndex((r) => r.teamId === match.awayTeamId) + 1;
  const homeForm = standings.find((r) => r.teamId === match.homeTeamId)?.form ?? [];
  const awayForm = standings.find((r) => r.teamId === match.awayTeamId)?.form ?? [];

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
  let h2hHomeGoals = 0;
  let h2hAwayGoals = 0;
  for (const m of h2h) {
    const homeGoals = m.homeTeamId === match.homeTeamId ? m.homeScore : m.awayScore;
    const awayGoals = m.homeTeamId === match.homeTeamId ? m.awayScore : m.homeScore;
    h2hHomeGoals += homeGoals;
    h2hAwayGoals += awayGoals;
    if (homeGoals > awayGoals) h2hHomeWins++;
    else if (homeGoals < awayGoals) h2hAwayWins++;
    else h2hDraws++;
  }

  const [homeNextMatch, awayNextMatch, leagueAttendance] = await Promise.all([
    prisma.match.findFirst({
      where: {
        status: "SCHEDULED",
        id: { not: id },
        kickoffAt: { gt: match.kickoffAt },
        OR: [{ homeTeamId: match.homeTeamId }, { awayTeamId: match.homeTeamId }],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" },
    }),
    prisma.match.findFirst({
      where: {
        status: "SCHEDULED",
        id: { not: id },
        kickoffAt: { gt: match.kickoffAt },
        OR: [{ homeTeamId: match.awayTeamId }, { awayTeamId: match.awayTeamId }],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" },
    }),
    prisma.match.aggregate({
      where: { leagueId: match.leagueId, status: "FINISHED", spectators: { gt: 0 } },
      _avg: { spectators: true },
    }),
  ]);
  const avgSpectators = leagueAttendance._avg.spectators ?? 0;

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ตาราง", href: `/leagues/${match.leagueId}?tab=standings` },
    {
      icon: "↗",
      label: "แชร์",
      href: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`,
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      {match.status === "LIVE" && <meta httpEquiv="refresh" content="60" />}
      <div className="px-6 md:px-16 py-4 text-sm flex items-center justify-between gap-3 flex-wrap">
        <span className="text-foreground/60">
          <Link href={`/leagues/${match.leagueId}`} className="hover:text-accent">
            {match.league.name}
          </Link>{" "}
          <span className="text-foreground/30">›</span> นัดที่ {match.round}
        </span>
        <ShareLinks
          url={pageUrl}
          text={`${match.homeTeam.name} ${match.status === "SCHEDULED" ? "vs" : `${match.homeScore}-${match.awayScore}`} ${match.awayTeam.name} · ${match.league.name}`}
        />
      </div>

      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-10">
        <div className="glow-blob w-96 h-96 -top-32 left-1/2 -translate-x-1/2" />
        <div className="flex items-center justify-center gap-3 text-xs font-display font-semibold mb-4">
          {match.stage !== "LEAGUE" && (
            <span className="rounded-full border border-accent/40 bg-accent/10 text-accent px-3 py-1">
              {match.stage === "FINAL" ? "🏆 นัดชิงชนะเลิศ" : "รอบรองชนะเลิศ"}
            </span>
          )}
          {match.status === "LIVE" ? (
            <span className="live-glow flex items-center gap-1.5 text-accent rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> LIVE ·{" "}
              {hasHalfTime ? "ครึ่งหลัง" : "ครึ่งแรก"} {liveMinute}&apos;
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
            {match.status === "SCHEDULED" && homeForm.length > 0 && (
              <div className="flex gap-1 justify-end mt-1.5">
                {homeForm.map((f, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center ${FORM_LABEL[f].className}`}
                  >
                    {FORM_LABEL[f].t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="font-display italic font-black text-5xl md:text-7xl text-foreground shrink-0 tracking-tight drop-shadow-[0_0_25px_rgba(212,255,58,0.15)]">
            {match.status === "SCHEDULED" ? "vs" : `${match.homeScore} - ${match.awayScore}`}
          </span>
          <div className="flex-1">
            <div className="font-display font-bold text-lg md:text-2xl text-foreground">
              {match.awayTeam.name}
            </div>
            <div className="text-xs text-foreground/50">
              {awayRank > 0 && `อันดับ ${awayRank} · `}เยือน
            </div>
            {match.status === "SCHEDULED" && awayForm.length > 0 && (
              <div className="flex gap-1 mt-1.5">
                {awayForm.map((f, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center ${FORM_LABEL[f].className}`}
                  >
                    {FORM_LABEL[f].t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-foreground/45">
          นัดที่ {match.round} ·{" "}
          {match.kickoffAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}{" "}
          <span className="text-foreground/30">(เวลาไทย)</span>
          {match.venue && (
            <>
              {" "}
              ·{" "}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match.venue)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent underline decoration-dotted"
              >
                📍 {match.venue}
              </a>
            </>
          )}
          {match.spectators != null && match.spectators > 0 && (
            <>
              {" "}
              · ผู้ชม {match.spectators}
              {avgSpectators > 0 && match.status === "FINISHED" && (
                <span
                  className={
                    match.spectators >= avgSpectators ? "text-accent/80" : "text-foreground/35"
                  }
                >
                  {" "}
                  ({match.spectators >= avgSpectators ? "+" : ""}
                  {Math.round(((match.spectators - avgSpectators) / avgSpectators) * 100)}%
                  จากค่าเฉลี่ยลีก)
                </span>
              )}
            </>
          )}
          {match.refereeName && <> · 🧑‍⚖️ {match.refereeName}</>}
        </p>
        {(() => {
          const ht = match.events.find((e) => e.type === "HALF_TIME");
          return ht ? (
            <p className="mt-1 text-center text-[11px] text-foreground/40">({ht.label})</p>
          ) : null;
        })()}
        {match.note && (
          <p className="mt-2 text-center text-xs text-yellow-400/90">📝 {match.note}</p>
        )}
        {match.status === "SCHEDULED" &&
          (() => {
            const hoursLeft = Math.round(
              (match.kickoffAt.getTime() - Date.now()) / 3600000
            );
            if (hoursLeft <= 0 || hoursLeft > 48) return null;
            return (
              <p className="mt-2 text-center text-xs text-accent">
                ⏳ เริ่มในอีกประมาณ {hoursLeft} ชั่วโมง
              </p>
            );
          })()}
        {match.streamUrl && (
          <div className="mt-3 flex justify-center">
            <a
              href={match.streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-md bg-red-600 text-white font-semibold px-5 py-2 text-sm ${
                match.status === "LIVE" ? "live-glow" : ""
              }`}
            >
              {match.status === "FINISHED" ? "▶ ดูย้อนหลัง" : "▶ ดูถ่ายทอดสด"}
            </a>
          </div>
        )}
        {match.status !== "SCHEDULED" &&
          (() => {
            const goals = match.events.filter(
              (e) => (e.type === "GOAL" || e.type === "OWN_GOAL") && e.minute != null
            );
            if (goals.length === 0) return null;
            const sideOf = (e: (typeof goals)[number]) =>
              e.type === "OWN_GOAL" ? (e.side === "HOME" ? "AWAY" : "HOME") : e.side;
            return (
              <div className="mt-5 mx-auto max-w-md px-4">
                <div className="relative h-8">
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15" />
                  {goals.map((g) => {
                    const pct = Math.min(100, ((g.minute ?? 0) / 95) * 100);
                    const isHome = sideOf(g) === "HOME";
                    return (
                      <span
                        key={g.id}
                        title={`${g.minute}' ${g.player?.name ?? ""}`}
                        className={`absolute w-2 h-2 rounded-full -translate-x-1/2 ${
                          isHome ? "top-1 bg-accent" : "bottom-1 bg-red-400"
                        }`}
                        style={{ left: `${pct}%` }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[9px] text-foreground/30">
                  <span>0&apos;</span>
                  <span>45&apos;</span>
                  <span>90&apos;+</span>
                </div>
                <p className="text-center text-[10px] text-foreground/35 mt-0.5">
                  ● บน = {match.homeTeam.name} · ● ล่าง = {match.awayTeam.name}
                </p>
              </div>
            );
          })()}
        {match.mvpPlayer && (
          <p className="mt-2 text-center text-xs text-accent">
            ⭐ ผู้เล่นยอดเยี่ยม: {match.mvpPlayer.name}
          </p>
        )}
      </div>

      <div className="px-6 md:px-16 py-10 flex-1 space-y-10">
        {(() => {
          const summary = buildMatchSummary(match);
          return (
            summary && (
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h2 className="font-display font-bold mb-2">สรุปเกม</h2>
                <p className="text-sm text-foreground/70 leading-relaxed">{summary}</p>
              </div>
            )
          );
        })()}

        {match.status === "SCHEDULED" &&
          homeForm.length + awayForm.length > 0 &&
          (() => {
            const pts = (f: ("W" | "D" | "L")[]) =>
              f.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0) + 1;
            const hp = pts(homeForm);
            const ap = pts(awayForm);
            const draw = 22;
            const rest = 100 - draw;
            const homePct = Math.round((hp / (hp + ap)) * rest);
            const awayPct = rest - homePct;
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5 max-w-xl mx-auto w-full">
                <h2 className="font-display font-bold mb-3 text-center text-sm">
                  โอกาสชนะ (ประเมินจากฟอร์ม 5 นัด)
                </h2>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-accent font-display font-bold">{homePct}%</span>
                  <span className="text-foreground/50">เสมอ {draw}%</span>
                  <span className="font-display font-bold">{awayPct}%</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
                  <div className="bg-accent" style={{ width: `${homePct}%` }} />
                  <div className="bg-white/25" style={{ width: `${draw}%` }} />
                  <div className="bg-white/50" style={{ width: `${awayPct}%` }} />
                </div>
              </div>
            );
          })()}

        {match.status !== "SCHEDULED" && (
          <div>
            <h2 className="font-display font-bold mb-4 flex items-center gap-3">
              สถิติแมตช์
              {(() => {
                const total = match.homePossession + match.awayPossession || 1;
                const homeDeg = (match.homePossession / total) * 360;
                return (
                  <span
                    className="w-8 h-8 rounded-full shrink-0"
                    title={`ครองบอล ${match.homePossession}% / ${match.awayPossession}%`}
                    style={{
                      background: `conic-gradient(var(--accent) 0deg ${homeDeg}deg, rgba(255,255,255,.2) ${homeDeg}deg 360deg)`,
                    }}
                  />
                );
              })()}
            </h2>
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
              <div className="text-xs text-foreground/45 pt-2 border-t border-white/5 flex justify-between">
                <span>
                  ความแม่นยิงเข้ากรอบ:{" "}
                  {match.homeShots > 0
                    ? Math.round((match.homeShotsOnTarget / match.homeShots) * 100)
                    : 0}
                  %
                </span>
                <span>
                  {match.awayShots > 0
                    ? Math.round((match.awayShotsOnTarget / match.awayShots) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>
        )}

        {standings.length > 0 &&
          (() => {
            const idxs = [homeRank - 1, awayRank - 1].filter((i) => i >= 0);
            if (idxs.length === 0) return null;
            const lo = Math.max(0, Math.min(...idxs) - 1);
            const hi = Math.min(standings.length - 1, Math.max(...idxs) + 1);
            const slice = standings.slice(lo, hi + 1);
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5 max-w-xl mx-auto w-full">
                <h2 className="font-display font-bold mb-3 text-sm">ตารางคะแนนช่วงนี้</h2>
                <div className="space-y-1 text-sm">
                  {slice.map((r, i) => {
                    const pos = lo + i + 1;
                    const isInMatch =
                      r.teamId === match.homeTeamId || r.teamId === match.awayTeamId;
                    return (
                      <div
                        key={r.teamId}
                        className={`flex items-center gap-3 rounded-md px-2 py-1 ${
                          isInMatch ? "bg-accent/10 text-accent" : "text-foreground/70"
                        }`}
                      >
                        <span className="w-5 font-display font-bold">{pos}</span>
                        <span className="flex-1 truncate">{r.teamName}</span>
                        <span className="font-display font-bold">{r.points}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
              {(() => {
                const totalGoals = h2h.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
                const results = h2h.map((m) => {
                  const hg = m.homeTeamId === match.homeTeamId ? m.homeScore : m.awayScore;
                  const ag = m.homeTeamId === match.homeTeamId ? m.awayScore : m.homeScore;
                  return hg > ag ? "W" : hg < ag ? "L" : "D";
                });
                let streak = 0;
                const first = results[0];
                for (const r of results) {
                  if (r === first && r !== "D") streak++;
                  else break;
                }
                const oldest = h2h[h2h.length - 1];
                return (
                  <div className="mb-4 space-y-2 text-xs text-foreground/50 text-center">
                    <div className="flex justify-center gap-1">
                      {results.map((r, i) => (
                        <span
                          key={i}
                          className={`w-5 h-5 rounded text-[10px] font-bold grid place-items-center ${
                            r === "W"
                              ? "bg-accent text-black"
                              : r === "L"
                                ? "bg-red-500 text-white"
                                : "bg-white/15 text-foreground"
                          }`}
                        >
                          {r === "W" ? "ช" : r === "L" ? "พ" : "ส"}
                        </span>
                      ))}
                      <span className="ml-2 self-center">(มุมมอง {match.homeTeam.name})</span>
                    </div>
                    <p>
                      รวมสกอร์ {match.homeTeam.name} {h2hHomeGoals}-{h2hAwayGoals}{" "}
                      {match.awayTeam.name} · เฉลี่ย {(totalGoals / h2h.length).toFixed(1)}{" "}
                      ประตู/นัดเมื่อเจอกัน
                      {streak >= 2 && (
                        <>
                          {" "}
                          ·{" "}
                          {first === "W" ? match.homeTeam.name : match.awayTeam.name} ชนะคู่นี้{" "}
                          {streak} นัดติด
                        </>
                      )}
                      {" "}· เจอกันครั้งแรก{" "}
                      {oldest.kickoffAt.toLocaleDateString("th-TH", { dateStyle: "medium" })}
                    </p>
                  </div>
                );
              })()}
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

        {(homeNextMatch || awayNextMatch) && (
          <div>
            <h2 className="font-display font-bold mb-4">โปรแกรมต่อไปของทั้งคู่</h2>
            <div className="rounded-xl border border-white/10 bg-card p-5 space-y-2 text-sm">
              {[
                { team: match.homeTeam.name, next: homeNextMatch },
                { team: match.awayTeam.name, next: awayNextMatch },
              ].map(({ team, next }) =>
                next ? (
                  <Link
                    key={next.id + team}
                    href={`/matches/${next.id}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10"
                  >
                    <span className="text-xs text-foreground/45 w-32 truncate shrink-0">{team}:</span>
                    <span className="flex-1 truncate">
                      {next.homeTeam.name} vs {next.awayTeam.name}
                    </span>
                    <span className="text-xs text-foreground/50 shrink-0">
                      {next.kickoffAt.toLocaleDateString("th-TH", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {next.kickoffAt.toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </Link>
                ) : (
                  <p key={team} className="px-3 py-2 text-xs text-foreground/40">
                    {team}: ไม่มีโปรแกรมถัดไป
                  </p>
                )
              )}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
            <h2 className="font-display font-bold">ไทม์ไลน์</h2>
            <span className="flex items-center gap-3 text-xs">
              <Link
                href={`/matches/${id}${goalsOnly ? "" : "?events=goals"}`}
                className={`rounded-full px-3 py-1 ${
                  goalsOnly ? "bg-accent text-black font-semibold" : "bg-white/5 text-foreground/60"
                }`}
              >
                ⚽ เฉพาะประตู
              </Link>
              {match.status !== "SCHEDULED" && (
                <span className="text-foreground/45">
                  ⚽ {goalCount} · 🟨 {yellowCount} · 🟥 {redCount}
                </span>
              )}
            </span>
          </div>
          <div className="rounded-xl border border-white/10 bg-card p-5">
            <MatchTimeline
              events={
                goalsOnly
                  ? match.events.filter((e) => e.type === "GOAL" || e.type === "OWN_GOAL")
                  : match.events
              }
            />
          </div>
        </div>

        {sameDayMatches.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-4">แมตช์อื่นวันเดียวกัน</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sameDayMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="rounded-xl border border-white/10 bg-card p-3 text-sm hover:border-accent/50"
                >
                  <div className="text-[10px] text-foreground/40 mb-1">{m.league.name}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.homeTeam.name}</span>
                    <span className="font-display font-bold shrink-0">
                      {m.status === "SCHEDULED"
                        ? m.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                        : `${m.homeScore}-${m.awayScore}`}
                    </span>
                    <span className="truncate text-right">{m.awayTeam.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          {prevId ? (
            <Link href={`/matches/${prevId}`} className="text-foreground/60 hover:text-accent">
              ← แมตช์ก่อนหน้า
            </Link>
          ) : (
            <span />
          )}
          {nextId ? (
            <Link href={`/matches/${nextId}`} className="text-foreground/60 hover:text-accent">
              แมตช์ถัดไป →
            </Link>
          ) : (
            <span />
          )}
        </div>

        {(homePlayers.length > 0 || awayPlayers.length > 0) && (
          <div>
            <h2 className="font-display font-bold mb-4">แผนผังตัวจริง</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PitchView
                teamName={match.homeTeam.name}
                color={match.homeTeam.color}
                players={homePlayers}
              />
              <PitchView
                teamName={match.awayTeam.name}
                color={match.awayTeam.color}
                players={awayPlayers}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LineupCard teamName={match.homeTeam.name} players={homePlayers} events={match.events} />
          <LineupCard teamName={match.awayTeam.name} players={awayPlayers} events={match.events} />
        </div>

        {(homeBench.length > 0 || awayBench.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LineupCard teamName={`${match.homeTeam.name} (สำรอง)`} players={homeBench} />
            <LineupCard teamName={`${match.awayTeam.name} (สำรอง)`} players={awayBench} />
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}

function LineupCard({
  teamName,
  players,
  events = [],
}: {
  teamName: string;
  players: { id: string; name: string; number: number }[];
  events?: { type: string; playerId: string | null; relatedPlayerId?: string | null }[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <h3 className="font-display font-bold mb-3">{teamName}</h3>
      <div className="space-y-2">
        {players.map((p) => {
          const g = events.filter((e) => e.type === "GOAL" && e.playerId === p.id).length;
          const a = events.filter(
            (e) => e.type === "GOAL" && e.relatedPlayerId === p.id
          ).length;
          const y = events.filter((e) => e.type === "YELLOW_CARD" && e.playerId === p.id).length;
          const r = events.filter((e) => e.type === "RED_CARD" && e.playerId === p.id).length;
          return (
          <div key={p.id} className="flex items-center gap-3 text-sm">
            <span className="w-6 text-foreground/45 font-display font-bold">{p.number}</span>
            <span className="flex-1">{p.name}</span>
            <span className="text-xs text-foreground/50 space-x-1">
              {g > 0 && <span>⚽{g > 1 ? `x${g}` : ""}</span>}
              {a > 0 && <span className="text-foreground/40">🅰{a > 1 ? `x${a}` : ""}</span>}
              {y > 0 && <span>🟨</span>}
              {r > 0 && <span>🟥</span>}
            </span>
          </div>
          );
        })}
        {players.length === 0 && <p className="text-foreground/50 text-sm">ยังไม่มีรายชื่อผู้เล่น</p>}
      </div>
    </div>
  );
}
