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
      {match.status === "LIVE" && <meta httpEquiv="refresh" content="60" />}
      <div className="px-6 md:px-16 py-4 text-sm flex items-center justify-between gap-3 flex-wrap">
        <Link href={`/leagues/${match.leagueId}`} className="text-foreground/60 hover:text-accent">
          ← {match.league.name}
        </Link>
        <ShareLinks
          url={pageUrl}
          text={`${match.homeTeam.name} ${match.status === "SCHEDULED" ? "vs" : `${match.homeScore}-${match.awayScore}`} ${match.awayTeam.name} · ${match.league.name}`}
        />
      </div>

      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-10">
        <div className="flex items-center justify-center gap-3 text-xs font-display font-semibold mb-4">
          {match.stage !== "LEAGUE" && (
            <span className="rounded-full border border-accent/40 bg-accent/10 text-accent px-3 py-1">
              {match.stage === "FINAL" ? "🏆 นัดชิงชนะเลิศ" : "รอบรองชนะเลิศ"}
            </span>
          )}
          {match.status === "LIVE" ? (
            <span className="flex items-center gap-1 text-accent">
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
          {match.kickoffAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
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
          {match.spectators != null && match.spectators > 0 && <> · ผู้ชม {match.spectators}</>}
        </p>
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
              className="rounded-md bg-red-600 text-white font-semibold px-5 py-2 text-sm"
            >
              ▶ ดูถ่ายทอดสด
            </a>
          </div>
        )}
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
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display font-bold">ไทม์ไลน์</h2>
            {match.status !== "SCHEDULED" && (
              <span className="text-xs text-foreground/45">
                ⚽ {goalCount} · 🟨 {yellowCount} · 🟥 {redCount}
              </span>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-card p-5">
            <MatchTimeline events={match.events} />
          </div>
        </div>

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
