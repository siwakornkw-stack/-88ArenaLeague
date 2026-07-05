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
  const homeRow = standings.find((r) => r.teamId === match.homeTeamId);
  const awayRow = standings.find((r) => r.teamId === match.awayTeamId);
  const homeForm = homeRow?.form ?? [];
  const awayForm = awayRow?.form ?? [];

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

  const [homeNextMatch, awayNextMatch, leagueAttendance, refereeMatches] = await Promise.all([
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
    match.refereeName
      ? prisma.match.findMany({
          where: {
            leagueId: match.leagueId,
            status: "FINISHED",
            refereeName: match.refereeName,
          },
          select: {
            id: true,
            events: { where: { type: { in: ["YELLOW_CARD", "RED_CARD"] } }, select: { type: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const avgSpectators = leagueAttendance._avg.spectators ?? 0;

  const refYellow = refereeMatches.reduce(
    (s, m) => s + m.events.filter((e) => e.type === "YELLOW_CARD").length,
    0
  );
  const refRed = refereeMatches.reduce(
    (s, m) => s + m.events.filter((e) => e.type === "RED_CARD").length,
    0
  );

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
        {match.status !== "SCHEDULED" &&
          (() => {
            const goals = match.events
              .filter((e) => (e.type === "GOAL" || e.type === "OWN_GOAL") && e.minute != null)
              .sort((a, b) => a.minute - b.minute);
            if (goals.length === 0) return null;
            const scoredFor = (e: (typeof goals)[number]) =>
              e.type === "OWN_GOAL" ? (e.side === "HOME" ? "AWAY" : "HOME") : e.side;
            const first = goals[0];
            const opener = scoredFor(first) === "HOME" ? match.homeTeam.name : match.awayTeam.name;
            const firstHalf = goals.filter((g) => (g.minute ?? 0) <= 45).length;
            const secondHalf = goals.length - firstHalf;
            const openerWon =
              match.status === "FINISHED" &&
              ((scoredFor(first) === "HOME" && match.homeScore > match.awayScore) ||
                (scoredFor(first) === "AWAY" && match.awayScore > match.homeScore));
            return (
              <p className="mt-2 text-center text-xs text-foreground/45">
                ประตูแรกนาที {first.minute}&apos; โดย {opener}
                {openerWon && <span className="text-accent/80"> · ทีมที่ยิงก่อนเป็นฝ่ายชนะ</span>} ·
                ครึ่งแรก {firstHalf} · ครึ่งหลัง {secondHalf} ประตู
              </p>
            );
          })()}
        {match.status === "FINISHED" &&
          (() => {
            const badges: { t: string; cls: string }[] = [];
            const bothScored = match.homeScore > 0 && match.awayScore > 0;
            const totalGoals = match.homeScore + match.awayScore;
            const margin = Math.abs(match.homeScore - match.awayScore);
            if (match.homeScore === 0 || match.awayScore === 0) {
              const keeper =
                match.awayScore === 0 ? match.homeTeam.name : match.awayTeam.name;
              if (!(match.homeScore === 0 && match.awayScore === 0))
                badges.push({ t: `🧤 คลีนชีต ${keeper}`, cls: "border-accent/40 bg-accent/10 text-accent" });
            }
            if (bothScored)
              badges.push({ t: "⚽ ยิงกันทั้งสองทีม", cls: "border-white/15 bg-white/5 text-foreground/70" });
            if (totalGoals >= 5)
              badges.push({ t: `🔥 ${totalGoals} ประตูรวม`, cls: "border-orange-400/40 bg-orange-400/10 text-orange-300" });
            if (margin >= 3)
              badges.push({ t: `💥 ชนะขาด ${margin} ลูก`, cls: "border-white/15 bg-white/5 text-foreground/70" });
            if (totalGoals === 0)
              badges.push({ t: "🥱 ไร้สกอร์", cls: "border-white/15 bg-white/5 text-foreground/50" });
            if (badges.length === 0) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {badges.map((b, i) => (
                  <span
                    key={i}
                    className={`rounded-full border px-3 py-1 text-[11px] font-display font-semibold ${b.cls}`}
                  >
                    {b.t}
                  </span>
                ))}
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

        {match.status !== "SCHEDULED" &&
          (() => {
            const goals = match.events.filter(
              (e) => (e.type === "GOAL" || e.type === "OWN_GOAL") && e.player
            );
            const scoredFor = (e: (typeof goals)[number]) =>
              e.type === "OWN_GOAL" ? (e.side === "HOME" ? "AWAY" : "HOME") : e.side;
            const names = (side: "HOME" | "AWAY") =>
              goals
                .filter((g) => scoredFor(g) === side)
                .sort((a, b) => a.minute - b.minute)
                .map((g) => `${g.player!.name} ${g.minute}'${g.type === "OWN_GOAL" ? " (OG)" : ""}`)
                .join(", ");
            const homeScorers = names("HOME");
            const awayScorers = names("AWAY");
            const dateStr = match.kickoffAt.toLocaleDateString("th-TH", { dateStyle: "medium" });
            const lines = [
              `${match.league.name} · นัดที่ ${match.round} · ${dateStr}`,
              `${match.homeTeam.name} ${match.homeScore}-${match.awayScore} ${match.awayTeam.name}`,
            ];
            if (homeScorers) lines.push(`⚽ ${match.homeTeam.name}: ${homeScorers}`);
            if (awayScorers) lines.push(`⚽ ${match.awayTeam.name}: ${awayScorers}`);
            lines.push(pageUrl);
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h2 className="font-display font-bold mb-2 text-sm">คัดลอกผลไปแชร์ 📋</h2>
                <pre className="whitespace-pre-wrap select-all rounded-lg bg-black/40 p-3 text-xs text-foreground/75 font-mono leading-relaxed">
                  {lines.join("\n")}
                </pre>
                <p className="mt-2 text-[10px] text-foreground/35">
                  แตะค้างเพื่อเลือกทั้งหมด แล้วคัดลอกไปวางในแชท
                </p>
              </div>
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

        {homeRow && awayRow && homeRow.played + awayRow.played > 0 && (
          <div className="rounded-xl border border-white/10 bg-card p-5 max-w-xl mx-auto w-full">
            <h2 className="font-display font-bold mb-3 text-center text-sm">ฟอร์มในลีกฤดูกาลนี้</h2>
            <div className="space-y-2.5 text-sm">
              {(
                [
                  { label: "แข่ง", h: homeRow.played, a: awayRow.played, hi: null },
                  { label: "ชนะ", h: homeRow.won, a: awayRow.won, hi: "max" },
                  { label: "เสมอ", h: homeRow.drawn, a: awayRow.drawn, hi: null },
                  { label: "แพ้", h: homeRow.lost, a: awayRow.lost, hi: "min" },
                  { label: "ได้ประตู", h: homeRow.goalsFor, a: awayRow.goalsFor, hi: "max" },
                  { label: "เสียประตู", h: homeRow.goalsAgainst, a: awayRow.goalsAgainst, hi: "min" },
                  { label: "ผลต่าง", h: homeRow.goalDiff, a: awayRow.goalDiff, hi: "max" },
                  { label: "คะแนน", h: homeRow.points, a: awayRow.points, hi: "max" },
                ] as const
              ).map((r) => {
                const homeBest =
                  r.hi === "max" ? r.h > r.a : r.hi === "min" ? r.h < r.a : false;
                const awayBest =
                  r.hi === "max" ? r.a > r.h : r.hi === "min" ? r.a < r.h : false;
                return (
                  <div key={r.label} className="grid grid-cols-3 items-center">
                    <span
                      className={`font-display font-bold text-left ${homeBest ? "text-accent" : "text-foreground"}`}
                    >
                      {r.hi === "max" && r.label === "ผลต่าง" && r.h > 0 ? "+" : ""}
                      {r.h}
                    </span>
                    <span className="text-center text-xs text-foreground/45">{r.label}</span>
                    <span
                      className={`font-display font-bold text-right ${awayBest ? "text-accent" : "text-foreground"}`}
                    >
                      {r.hi === "max" && r.label === "ผลต่าง" && r.a > 0 ? "+" : ""}
                      {r.a}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[10px] text-foreground/35">
              {match.homeTeam.name} (ซ้าย) · {match.awayTeam.name} (ขวา) · เฉพาะรอบลีก
            </p>
          </div>
        )}

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

        {match.status !== "SCHEDULED" &&
          (() => {
            const goals = match.events.filter(
              (e) => (e.type === "GOAL" || e.type === "OWN_GOAL") && e.player
            );
            if (goals.length === 0) return null;
            const scoredFor = (e: (typeof goals)[number]) =>
              e.type === "OWN_GOAL" ? (e.side === "HOME" ? "AWAY" : "HOME") : e.side;
            const grouped = new Map<
              string,
              { name: string; side: "HOME" | "AWAY"; minutes: number[]; og: boolean }
            >();
            for (const g of goals) {
              const side = scoredFor(g) as "HOME" | "AWAY";
              const key = `${g.playerId}-${g.type === "OWN_GOAL"}`;
              const row = grouped.get(key) ?? {
                name: g.player!.name,
                side,
                minutes: [],
                og: g.type === "OWN_GOAL",
              };
              row.minutes.push(g.minute);
              grouped.set(key, row);
            }
            const rows = [...grouped.values()].sort(
              (a, b) => Math.min(...a.minutes) - Math.min(...b.minutes)
            );
            const homeRows = rows.filter((r) => r.side === "HOME");
            const awayRows = rows.filter((r) => r.side === "AWAY");
            const col = (list: typeof rows, align: string) => (
              <div className={`space-y-1.5 ${align}`}>
                {list.length === 0 ? (
                  <p className="text-xs text-foreground/35">-</p>
                ) : (
                  list.map((r, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-display font-semibold">{r.name}</span>
                      {r.og && <span className="text-red-400/80 text-[10px]"> (เข้าประตูตัวเอง)</span>}
                      <span className="text-foreground/45 text-xs">
                        {" "}
                        {r.minutes.sort((a, b) => a - b).map((m) => `${m}'`).join(", ")}
                        {r.minutes.length > 1 && ` ·${r.minutes.length} ประตู`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            );
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h2 className="font-display font-bold mb-4">ผู้ทำประตูในนัดนี้ ⚽</h2>
                <div className="grid grid-cols-2 gap-6">
                  {col(homeRows, "text-right")}
                  {col(awayRows, "text-left")}
                </div>
              </div>
            );
          })()}

        {match.status !== "SCHEDULED" &&
          (() => {
            const goals = match.events
              .filter((e) => (e.type === "GOAL" || e.type === "OWN_GOAL") && e.minute != null)
              .sort((a, b) => a.minute - b.minute);
            if (goals.length < 2) return null;
            const first = goals[0].minute ?? 0;
            const last = goals[goals.length - 1].minute ?? 0;
            let maxGap = first;
            let gapStart = 0;
            let gapEnd = first;
            for (let i = 1; i < goals.length; i++) {
              const gap = (goals[i].minute ?? 0) - (goals[i - 1].minute ?? 0);
              if (gap > maxGap) {
                maxGap = gap;
                gapStart = goals[i - 1].minute ?? 0;
                gapEnd = goals[i].minute ?? 0;
              }
            }
            const cards: { label: string; value: string; sub: string }[] = [
              { label: "ประตูเร็วสุด", value: `${first}'`, sub: goals[0].player?.name ?? "-" },
              { label: "ประตูช้าสุด", value: `${last}'`, sub: goals[goals.length - 1].player?.name ?? "-" },
              {
                label: "ช่วงไร้ประตูนานสุด",
                value: `${maxGap}′`,
                sub: `นาที ${gapStart}-${gapEnd}`,
              },
            ];
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5 max-w-xl mx-auto w-full">
                <h2 className="font-display font-bold mb-3 text-sm">สถิติเด่นในนัดนี้ ⏱️</h2>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {cards.map((c) => (
                    <div key={c.label} className="rounded-lg bg-white/5 px-2 py-3">
                      <div className="font-display italic font-extrabold text-2xl text-accent">
                        {c.value}
                      </div>
                      <div className="text-[11px] text-foreground/45 mt-0.5">{c.label}</div>
                      <div className="text-[10px] text-foreground/35 truncate mt-0.5">{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        {match.status !== "SCHEDULED" &&
          (() => {
            const goals = match.events.filter(
              (e) => (e.type === "GOAL" || e.type === "OWN_GOAL") && e.minute != null
            );
            if (goals.length === 0) return null;
            const scoredFor = (e: (typeof goals)[number]) =>
              e.type === "OWN_GOAL" ? (e.side === "HOME" ? "AWAY" : "HOME") : e.side;
            const bins = [
              { label: "0-15", from: 0, to: 15 },
              { label: "16-30", from: 16, to: 30 },
              { label: "31-45", from: 31, to: 45 },
              { label: "46-60", from: 46, to: 60 },
              { label: "61-75", from: 61, to: 75 },
              { label: "76+", from: 76, to: 200 },
            ].map((b) => {
              const h = goals.filter(
                (g) => scoredFor(g) === "HOME" && (g.minute ?? 0) >= b.from && (g.minute ?? 0) <= b.to
              ).length;
              const a = goals.filter(
                (g) => scoredFor(g) === "AWAY" && (g.minute ?? 0) >= b.from && (g.minute ?? 0) <= b.to
              ).length;
              return { ...b, h, a };
            });
            const peak = bins.reduce((m, b) => Math.max(m, b.h + b.a), 0) || 1;
            const busiest = bins.reduce((m, b) => (b.h + b.a > m.h + m.a ? b : m), bins[0]);
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h2 className="font-display font-bold mb-4">จังหวะการทำประตูรายช่วงเวลา 📊</h2>
                <div className="grid grid-cols-6 gap-2 items-end h-28">
                  {bins.map((b) => (
                    <div key={b.label} className="flex flex-col items-center justify-end gap-1 h-full">
                      <div className="flex-1 flex flex-col justify-end w-full items-center gap-0.5">
                        {b.h > 0 && (
                          <div
                            className="w-4/5 bg-accent rounded-t"
                            style={{ height: `${(b.h / peak) * 100}%` }}
                            title={`${match.homeTeam.name} ${b.h} ประตู`}
                          />
                        )}
                        {b.a > 0 && (
                          <div
                            className="w-4/5 bg-red-400 rounded-t"
                            style={{ height: `${(b.a / peak) * 100}%` }}
                            title={`${match.awayTeam.name} ${b.a} ประตู`}
                          />
                        )}
                      </div>
                      <span className="text-[9px] text-foreground/40">{b.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-center text-[10px] text-foreground/35">
                  ■ {match.homeTeam.name} · ■ {match.awayTeam.name}
                  {busiest.h + busiest.a > 0 && (
                    <> · ช่วงที่มีประตูมากสุด: นาที {busiest.label}</>
                  )}
                </p>
              </div>
            );
          })()}

        {match.status !== "SCHEDULED" &&
          (() => {
            const assists = match.events.filter(
              (e) => e.type === "GOAL" && e.relatedPlayer
            );
            if (assists.length === 0) return null;
            const grouped = new Map<
              string,
              { name: string; side: "HOME" | "AWAY"; count: number }
            >();
            for (const a of assists) {
              const key = a.relatedPlayerId!;
              const row = grouped.get(key) ?? {
                name: a.relatedPlayer!.name,
                side: (a.side === "HOME" ? "HOME" : "AWAY") as "HOME" | "AWAY",
                count: 0,
              };
              row.count++;
              grouped.set(key, row);
            }
            const rows = [...grouped.values()].sort((a, b) => b.count - a.count);
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h2 className="font-display font-bold mb-4">ผู้จ่ายบอลให้เพื่อนทำประตู 🅰️</h2>
                <div className="grid grid-cols-2 gap-6">
                  {(["HOME", "AWAY"] as const).map((sd) => {
                    const list = rows.filter((r) => r.side === sd);
                    return (
                      <div key={sd} className={`space-y-1.5 ${sd === "HOME" ? "text-right" : "text-left"}`}>
                        {list.length === 0 ? (
                          <p className="text-xs text-foreground/35">-</p>
                        ) : (
                          list.map((r, i) => (
                            <div key={i} className="text-sm">
                              <span className="font-display font-semibold">{r.name}</span>
                              <span className="text-foreground/45 text-xs">
                                {" "}
                                {r.count} แอสซิสต์
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {match.status !== "SCHEDULED" &&
          (() => {
            const cards = match.events.filter(
              (e) => (e.type === "YELLOW_CARD" || e.type === "RED_CARD") && e.side !== "NEUTRAL"
            );
            if (cards.length === 0) return null;
            const count = (side: string, type: string) =>
              cards.filter((e) => e.side === side && e.type === type).length;
            const homeY = count("HOME", "YELLOW_CARD");
            const homeR = count("HOME", "RED_CARD");
            const awayY = count("AWAY", "YELLOW_CARD");
            const awayR = count("AWAY", "RED_CARD");
            const firstCard = cards
              .filter((e) => e.minute != null)
              .sort((a, b) => a.minute - b.minute)[0];
            const cleaner =
              homeY + homeR * 2 < awayY + awayR * 2
                ? match.homeTeam.name
                : homeY + homeR * 2 > awayY + awayR * 2
                  ? match.awayTeam.name
                  : null;
            return (
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h2 className="font-display font-bold mb-4">วินัยในสนาม</h2>
                <div className="flex items-center justify-center gap-10 text-center">
                  <div>
                    <div className="text-xs text-foreground/50 mb-1">{match.homeTeam.name}</div>
                    <div className="font-display font-bold">
                      🟨 {homeY} · 🟥 {homeR}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground/50 mb-1">{match.awayTeam.name}</div>
                    <div className="font-display font-bold">
                      🟨 {awayY} · 🟥 {awayR}
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 text-center text-xs text-foreground/45 space-y-1">
                  {firstCard?.player && (
                    <p>
                      ใบแรก: 🟨 {firstCard.player.name} ({firstCard.side === "HOME" ? match.homeTeam.name : match.awayTeam.name}) นาที {firstCard.minute}&apos;
                    </p>
                  )}
                  {cleaner && <p className="text-accent/80">เล่นสะอาดกว่า: {cleaner}</p>}
                </div>
              </div>
            );
          })()}

        {match.refereeName && refereeMatches.length > 1 && (
          <div className="rounded-xl border border-white/10 bg-card p-5 max-w-xl mx-auto w-full">
            <h2 className="font-display font-bold mb-3 text-sm">โปรไฟล์ผู้ตัดสิน 🧑‍⚖️</h2>
            <p className="text-center text-sm text-foreground/70 mb-3">{match.refereeName}</p>
            <div className="grid grid-cols-3 text-center">
              <div>
                <div className="font-display italic font-extrabold text-2xl text-foreground">
                  {refereeMatches.length}
                </div>
                <div className="text-[11px] text-foreground/45">นัดในลีกนี้</div>
              </div>
              <div>
                <div className="font-display italic font-extrabold text-2xl text-yellow-300">
                  {(refYellow / refereeMatches.length).toFixed(1)}
                </div>
                <div className="text-[11px] text-foreground/45">🟨 เฉลี่ย/นัด</div>
              </div>
              <div>
                <div className="font-display italic font-extrabold text-2xl text-red-400">
                  {refRed}
                </div>
                <div className="text-[11px] text-foreground/45">🟥 รวม</div>
              </div>
            </div>
          </div>
        )}

        {(() => {
          const subs = match.events.filter((e) => e.type === "SUBSTITUTION");
          if (subs.length === 0) return null;
          const sideName = (s: string) =>
            s === "HOME" ? match.homeTeam.name : s === "AWAY" ? match.awayTeam.name : "";
          return (
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h2 className="font-display font-bold mb-4">การเปลี่ยนตัว 🔄</h2>
              <div className="space-y-2 text-sm">
                {subs
                  .slice()
                  .sort((a, b) => a.minute - b.minute)
                  .map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                      <span className="w-8 font-display font-bold text-accent shrink-0">
                        {s.minute}&apos;
                      </span>
                      <span className="text-foreground/45 text-xs w-24 truncate shrink-0">
                        {sideName(s.side)}
                      </span>
                      <span className="flex-1 flex items-center gap-1.5 flex-wrap">
                        {s.player && <span className="text-accent">↑ {s.player.name}</span>}
                        {s.relatedPlayer && (
                          <span className="text-foreground/50">↓ {s.relatedPlayer.name}</span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })()}

        {(() => {
          const notable = match.events.filter(
            (e) => e.type === "PENALTY_MISSED" || e.type === "INJURY"
          );
          if (notable.length === 0) return null;
          const sideName = (s: string) =>
            s === "HOME" ? match.homeTeam.name : s === "AWAY" ? match.awayTeam.name : "";
          return (
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h2 className="font-display font-bold mb-4">เหตุการณ์สำคัญอื่นๆ</h2>
              <div className="space-y-2 text-sm">
                {notable
                  .slice()
                  .sort((a, b) => a.minute - b.minute)
                  .map((e) => (
                    <div key={e.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                      <span className="w-8 font-display font-bold text-accent shrink-0">
                        {e.minute}&apos;
                      </span>
                      <span className="shrink-0">
                        {e.type === "PENALTY_MISSED" ? "❌ จุดโทษพลาด" : "🚑 บาดเจ็บ"}
                      </span>
                      <span className="flex-1 truncate text-foreground/70">
                        {e.player?.name ?? e.label}
                        {sideName(e.side) && (
                          <span className="text-foreground/40 text-xs"> · {sideName(e.side)}</span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })()}

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
