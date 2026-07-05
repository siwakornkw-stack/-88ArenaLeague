import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  computeStandings,
  computeStandingsUpTo,
  computeHomeAwayStandings,
} from "@/lib/standings";
import { getTopScorers, getTopAssists, getTopMvps, getGoalContributions } from "@/lib/topScorers";
import { TeamBadge } from "@/components/team-badge";
import { getDiscipline } from "@/lib/discipline";
import { headers } from "next/headers";
import { getLeagueCharts } from "@/lib/leagueStats";
import { GoalsBarChart, PointsLineChart } from "@/components/league-charts";
import { ShareLinks } from "@/components/share-links";
import { MobileNav } from "@/components/mobile-nav";

const STAGE_LABEL: Record<string, string> = {
  SEMI_FINAL: "รอบรองชนะเลิศ",
  FINAL: "นัดชิงชนะเลิศ",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) return {};
  const title = `${league.name} ฤดูกาล ${league.seasonYear} · 88ArenaLeague`;
  const description =
    league.description ?? `ตารางคะแนน โปรแกรมแข่ง และผลบอลสดของ ${league.name}`;
  return {
    title,
    description,
    openGraph: { title, description },
    alternates: { canonical: `https://league-manager-app.vercel.app/leagues/${id}` },
  };
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "จัดตารางแล้ว",
  IN_PROGRESS: "กำลังแข่งขัน",
  FINISHED: "จบฤดูกาล",
};

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

export default async function PublicLeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    round?: string;
    team?: string;
    asof?: string;
    side?: string;
  }>;
}) {
  const { id } = await params;
  const { tab = "standings", round, team, asof, side } = await searchParams;
  const roundFilter = Number(round) || null;
  const sideView = side === "home" ? "HOME" : side === "away" ? "AWAY" : null;

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      teams: { include: { _count: { select: { players: true } } } },
      sponsors: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!league) notFound();

  const h = await headers();
  const pageUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "league-manager-app.vercel.app"}/leagues/${id}`;

  const teamFilter = team && league.teams.some((t) => t.id === team) ? team : null;

  const matches = await prisma.match.findMany({
    where: { leagueId: id },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
  });

  const matchesByRound = new Map<number, typeof matches>();
  for (const m of matches) {
    if (!matchesByRound.has(m.round)) matchesByRound.set(m.round, []);
    matchesByRound.get(m.round)!.push(m);
  }
  const totalRounds = matches.reduce((max, m) => Math.max(max, m.round), 0);
  const currentRound = matches.find((m) => m.status !== "FINISHED")?.round ?? totalRounds;
  const upcomingFixtures = matchesByRound.get(currentRound) ?? [];

  const finishedLeagueMatches = matches.filter(
    (m) => m.stage === "LEAGUE" && m.status === "FINISHED"
  );
  const maxFinishedRound = finishedLeagueMatches.reduce((max, m) => Math.max(max, m.round), 0);
  const asofRaw = Number(asof) || null;
  const asofRound =
    tab === "standings" && !sideView && asofRaw && asofRaw >= 1 && asofRaw < maxFinishedRound
      ? asofRaw
      : null;

  const isFinished = league.status === "FINISHED";
  const standings =
    tab === "standings" || tab === "teams" || tab === "discipline" || isFinished
      ? sideView && tab === "standings"
        ? await computeHomeAwayStandings(id, sideView)
        : asofRound
          ? await computeStandingsUpTo(id, asofRound + 1)
          : await computeStandings(id)
      : [];
  const topScorers = tab === "standings" || isFinished ? await getTopScorers(id, 5) : [];
  const discipline = tab === "discipline" ? await getDiscipline(id) : null;
  const bannedPlayers =
    tab === "discipline"
      ? await prisma.player.findMany({
          where: { team: { leagueId: id }, status: "BANNED" },
          include: { team: true },
        })
      : [];
  const topAssists = tab === "standings" ? await getTopAssists(id, 5) : [];
  const news =
    tab === "news"
      ? await prisma.leagueNews.findMany({
          where: { leagueId: id },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        })
      : [];
  const goalMinutes =
    tab === "stats"
      ? await prisma.matchEvent.findMany({
          where: { type: "GOAL", match: { leagueId: id, stage: "LEAGUE" } },
          select: { minute: true },
        })
      : [];
  const heatBuckets = [0, 0, 0, 0, 0, 0];
  for (const g of goalMinutes) {
    heatBuckets[Math.min(5, Math.floor(Math.max(0, g.minute - 1) / 15))]++;
  }
  const charts = tab === "stats" ? await getLeagueCharts(id) : null;
  const playerBoards =
    tab === "players"
      ? {
          scorers: await getTopScorers(id, 20),
          assists: await getTopAssists(id, 20),
          cards: (await getDiscipline(id)).players,
          mvps: await getTopMvps(id, 10),
          contributions: await getGoalContributions(id, 10),
        }
      : null;

  const crossScore = new Map<string, (typeof matches)[number]>();
  for (const m of finishedLeagueMatches) crossScore.set(`${m.homeTeamId}:${m.awayTeamId}`, m);

  let records: { label: string; value: string; sub?: string }[] = [];
  if (tab === "stats" && finishedLeagueMatches.length > 0) {
    const teamName = new Map(league.teams.map((t) => [t.id, t.name]));
    const highest = finishedLeagueMatches.reduce((a, b) =>
      b.homeScore + b.awayScore > a.homeScore + a.awayScore ? b : a
    );
    const biggest = finishedLeagueMatches.reduce((a, b) =>
      Math.abs(b.homeScore - b.awayScore) > Math.abs(a.homeScore - a.awayScore) ? b : a
    );
    const cleanSheets = new Map<string, number>();
    const goalsFor = new Map<string, number>();
    for (const m of finishedLeagueMatches) {
      if (m.awayScore === 0) cleanSheets.set(m.homeTeamId, (cleanSheets.get(m.homeTeamId) ?? 0) + 1);
      if (m.homeScore === 0) cleanSheets.set(m.awayTeamId, (cleanSheets.get(m.awayTeamId) ?? 0) + 1);
      goalsFor.set(m.homeTeamId, (goalsFor.get(m.homeTeamId) ?? 0) + m.homeScore);
      goalsFor.set(m.awayTeamId, (goalsFor.get(m.awayTeamId) ?? 0) + m.awayScore);
    }
    records = [
      {
        label: "แมตช์ประตูเยอะสุด",
        value: `${highest.homeTeam.name} ${highest.homeScore}-${highest.awayScore} ${highest.awayTeam.name}`,
        sub: `${highest.homeScore + highest.awayScore} ประตู`,
      },
    ];
    if (biggest.homeScore !== biggest.awayScore) {
      records.push({
        label: "ชนะขาดสุด",
        value: `${biggest.homeTeam.name} ${biggest.homeScore}-${biggest.awayScore} ${biggest.awayTeam.name}`,
        sub: `ห่าง ${Math.abs(biggest.homeScore - biggest.awayScore)} ประตู`,
      });
    }
    if (cleanSheets.size > 0) {
      const [csTeam, csCount] = [...cleanSheets.entries()].sort((a, b) => b[1] - a[1])[0];
      records.push({ label: "คลีนชีตมากสุด", value: teamName.get(csTeam) ?? "-", sub: `${csCount} นัด` });
    }
    if (goalsFor.size > 0) {
      const [atkTeam, atkGoals] = [...goalsFor.entries()].sort((a, b) => b[1] - a[1])[0];
      records.push({ label: "เกมรุกดีสุด", value: teamName.get(atkTeam) ?? "-", sub: `${atkGoals} ประตู` });
    }
    const goalsAgainst = new Map<string, number>();
    const draws = new Map<string, number>();
    for (const m of finishedLeagueMatches) {
      goalsAgainst.set(m.homeTeamId, (goalsAgainst.get(m.homeTeamId) ?? 0) + m.awayScore);
      goalsAgainst.set(m.awayTeamId, (goalsAgainst.get(m.awayTeamId) ?? 0) + m.homeScore);
      if (m.homeScore === m.awayScore) {
        draws.set(m.homeTeamId, (draws.get(m.homeTeamId) ?? 0) + 1);
        draws.set(m.awayTeamId, (draws.get(m.awayTeamId) ?? 0) + 1);
      }
    }
    if (goalsAgainst.size > 0) {
      const [defTeam, defGoals] = [...goalsAgainst.entries()].sort((a, b) => a[1] - b[1])[0];
      records.push({ label: "เกมรับดีสุด", value: teamName.get(defTeam) ?? "-", sub: `เสีย ${defGoals} ประตู` });
    }
    if (draws.size > 0) {
      const [drawTeam, drawCount] = [...draws.entries()].sort((a, b) => b[1] - a[1])[0];
      records.push({ label: "เสมอมากสุด", value: teamName.get(drawTeam) ?? "-", sub: `${drawCount} นัด` });
    }
    const homeWins = finishedLeagueMatches.filter((m) => m.homeScore > m.awayScore);
    if (homeWins.length > 0) {
      const big = homeWins.reduce((a, b) =>
        b.homeScore - b.awayScore > a.homeScore - a.awayScore ? b : a
      );
      records.push({
        label: "ถล่มเจ้าบ้านสุด (เหย้าชนะ)",
        value: `${big.homeTeam.name} ${big.homeScore}-${big.awayScore} ${big.awayTeam.name}`,
      });
    }
    const awayWins = finishedLeagueMatches.filter((m) => m.awayScore > m.homeScore);
    if (awayWins.length > 0) {
      const big = awayWins.reduce((a, b) =>
        b.awayScore - b.homeScore > a.awayScore - a.homeScore ? b : a
      );
      records.push({
        label: "บุกชนะขาดสุด (เยือน)",
        value: `${big.homeTeam.name} ${big.homeScore}-${big.awayScore} ${big.awayTeam.name}`,
      });
    }
    const quiet = finishedLeagueMatches.reduce((a, b) =>
      b.homeScore + b.awayScore < a.homeScore + a.awayScore ? b : a
    );
    records.push({
      label: "เกมเหนียวสุด (ประตูน้อยสุด)",
      value: `${quiet.homeTeam.name} ${quiet.homeScore}-${quiet.awayScore} ${quiet.awayTeam.name}`,
    });
  }

  const zonesOn = !sideView && !asofRound;
  const movement = new Map<string, number>();
  if (tab === "standings" && !sideView && !asofRound && finishedLeagueMatches.length > 0) {
    const lastRound = finishedLeagueMatches.reduce((max, m) => Math.max(max, m.round), 0);
    if (lastRound >= 2) {
      const prev = await computeStandingsUpTo(id, lastRound);
      const prevPos = new Map(prev.map((r, i) => [r.teamId, i]));
      standings.forEach((r, i) => {
        const p = prevPos.get(r.teamId);
        if (p !== undefined) movement.set(r.teamId, p - i);
      });
    }
  }

  const nextFixture = matches.find((m) => m.status === "SCHEDULED") ?? null;
  const daysToNext = nextFixture
    ? Math.max(0, Math.ceil((nextFixture.kickoffAt.getTime() - Date.now()) / 86400000))
    : null;

  const finalMatch = matches.find((m) => m.stage === "FINAL" && m.status === "FINISHED") ?? null;
  let championName: string | null = null;
  let championNote: string | null = null;
  if (finalMatch) {
    const finalDraw = finalMatch.homeScore === finalMatch.awayScore;
    const finalWinner = finalMatch.homeScore >= finalMatch.awayScore ? finalMatch.homeTeam : finalMatch.awayTeam;
    championName = finalDraw
      ? (standings.find((r) => r.teamId === finalMatch.homeTeamId || r.teamId === finalMatch.awayTeamId)?.teamName ?? finalWinner.name)
      : finalWinner.name;
    championNote = `ชนะนัดชิง ${finalMatch.homeScore}-${finalMatch.awayScore}`;
  } else if (isFinished && !sideView && !asofRound && standings[0]) {
    championName = standings[0].teamName;
    championNote = `${standings[0].points} แต้ม · ชนะ ${standings[0].won} จาก ${standings[0].played} นัด`;
  }
  const seasonTopScorer = isFinished || finalMatch ? (topScorers[0] ?? null) : null;

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🏆", label: "ตาราง", href: `/leagues/${id}?tab=standings`, active: tab === "standings" },
    { icon: "📅", label: "โปรแกรม", href: `/leagues/${id}?tab=fixtures`, active: tab === "fixtures" },
    { icon: "👥", label: "ทีม", href: `/leagues/${id}?tab=teams`, active: tab === "teams" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8 flex flex-wrap items-start justify-between gap-4">
        <div className="glow-blob w-80 h-80 -top-24 right-10" />
        <div>
          <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
            {league.name}
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            ฤดูกาล {league.seasonYear} · {league.teams.length} ทีม · {STATUS_LABEL[league.status]}
            {totalRounds > 0 && <> · นัดที่ {currentRound} จาก {totalRounds}</>}
          </p>
          {league.description && (
            <p className="mt-2 text-sm text-foreground/60 max-w-xl whitespace-pre-line">
              {league.description}
            </p>
          )}
          {nextFixture && (
            <p className="mt-2 text-xs text-accent">
              นัดถัดไป: {nextFixture.homeTeam.name} vs {nextFixture.awayTeam.name} ·{" "}
              {daysToNext === 0 ? "วันนี้" : `อีก ${daysToNext} วัน`}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {matches.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              <a
                href={`/leagues/${id}/calendar`}
                className="rounded-md border border-white/25 px-4 py-2 text-sm text-foreground/80 hover:border-accent/50 hover:text-accent"
              >
                📅 เพิ่มลงปฏิทิน
              </a>
              <a
                href={`/leagues/${id}/export/standings`}
                className="rounded-md border border-white/25 px-3 py-2 text-xs text-foreground/70 hover:border-accent/50 hover:text-accent"
              >
                ⬇ CSV ตาราง
              </a>
              <a
                href={`/leagues/${id}/export/results`}
                className="rounded-md border border-white/25 px-3 py-2 text-xs text-foreground/70 hover:border-accent/50 hover:text-accent"
              >
                ⬇ CSV ผลแข่ง
              </a>
              <a
                href={`/leagues/${id}/export/players`}
                className="rounded-md border border-white/25 px-3 py-2 text-xs text-foreground/70 hover:border-accent/50 hover:text-accent"
              >
                ⬇ CSV นักเตะ
              </a>
            </div>
          )}
          <ShareLinks url={pageUrl} text={league.name} />
        </div>
      </div>

      {league.sponsors.length > 0 && (
        <div className="px-6 md:px-16 py-3 border-b border-white/5 flex items-center gap-4 flex-wrap">
          <span className="text-xs text-foreground/40">ผู้สนับสนุน:</span>
          {league.sponsors.map((s) => {
            const inner = (
              <span className="flex items-center gap-2 text-sm text-foreground/70">
                {s.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logoUrl} alt={s.name} className="h-8 w-8 rounded object-cover" />
                )}
                {s.name}
              </span>
            );
            return s.url ? (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent"
              >
                {inner}
              </a>
            ) : (
              <span key={s.id}>{inner}</span>
            );
          })}
        </div>
      )}

      {championName && (
        <div className="mx-6 md:mx-16 mt-6 rounded-2xl border border-accent/40 bg-gradient-to-r from-[#1a2e12] to-card p-5 flex flex-wrap items-center gap-6">
          <span className="text-4xl">🏆</span>
          <div>
            <div className="text-xs text-foreground/50">แชมป์ฤดูกาล {league.seasonYear}</div>
            <div className="font-display italic font-extrabold text-2xl text-accent">
              {championName}
            </div>
            {championNote && <div className="text-xs text-foreground/60">{championNote}</div>}
          </div>
          {seasonTopScorer && (
            <div className="ml-auto text-right">
              <div className="text-xs text-foreground/50">ดาวซัลโวฤดูกาล</div>
              <div className="font-display font-bold">{seasonTopScorer.playerName}</div>
              <div className="text-xs text-accent">{seasonTopScorer.goals} ประตู</div>
            </div>
          )}
        </div>
      )}

      <div className="px-6 md:px-16 py-8 flex-1">
        <div className="flex gap-2 mb-6 overflow-x-auto whitespace-nowrap pb-1">
          <Link
            href={`/leagues/${id}?tab=standings`}
            className={`rounded-full px-4 py-1.5 text-sm font-display font-semibold transition-colors ${
              tab === "standings" ? "bg-accent text-black" : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            ตารางคะแนน
          </Link>
          <Link
            href={`/leagues/${id}?tab=fixtures`}
            className={`rounded-full px-4 py-1.5 text-sm font-display font-semibold transition-colors ${
              tab === "fixtures" ? "bg-accent text-black" : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            โปรแกรมแข่ง
          </Link>
          <Link
            href={`/leagues/${id}?tab=teams`}
            className={`rounded-full px-4 py-1.5 text-sm font-display font-semibold transition-colors ${
              tab === "teams" ? "bg-accent text-black" : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            ทีม
          </Link>
          <Link
            href={`/leagues/${id}?tab=discipline`}
            className={`rounded-full px-4 py-1.5 text-sm font-display font-semibold transition-colors ${
              tab === "discipline" ? "bg-accent text-black" : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            วินัย
          </Link>
          <Link
            href={`/leagues/${id}?tab=news`}
            className={`rounded-full px-4 py-1.5 text-sm font-display font-semibold transition-colors ${
              tab === "news" ? "bg-accent text-black" : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            ข่าวสาร
          </Link>
          <Link
            href={`/leagues/${id}?tab=stats`}
            className={`rounded-full px-4 py-1.5 text-sm font-display font-semibold transition-colors ${
              tab === "stats" ? "bg-accent text-black" : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            กราฟ
          </Link>
          <Link
            href={`/leagues/${id}?tab=players`}
            className={`rounded-full px-4 py-1.5 text-sm font-display font-semibold transition-colors ${
              tab === "players" ? "bg-accent text-black" : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            นักเตะ
          </Link>
        </div>

        {tab === "teams" ? (
          <div className="space-y-4">
          <Link
            href={`/leagues/${id}/compare`}
            className="inline-block rounded-md border border-white/20 px-4 py-2 text-sm text-foreground/75 hover:border-accent/50 hover:text-accent"
          >
            ⚖ เปรียบเทียบทีม
          </Link>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...league.teams]
              .sort((a, b) => {
                const ia = standings.findIndex((r) => r.teamId === a.id);
                const ib = standings.findIndex((r) => r.teamId === b.id);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
              })
              .map((team) => {
                const teamRank = standings.findIndex((r) => r.teamId === team.id) + 1;
                const nextFx = matches.find(
                  (m) =>
                    m.status === "SCHEDULED" &&
                    (m.homeTeamId === team.id || m.awayTeamId === team.id)
                );
                return (
              <Link
                key={team.id}
                href={`/leagues/${id}/teams/${team.id}`}
                className="hover-lift rounded-xl border border-white/10 bg-card p-4 flex items-center gap-3 hover:border-accent/50"
              >
                <TeamBadge
                  abbr={team.abbr}
                  color={team.color}
                  logoUrl={team.logoUrl}
                  className="w-10 h-10 text-xs"
                />
                <div className="min-w-0">
                  <div className="font-display font-semibold">
                    {teamRank > 0 && (
                      <span className="text-foreground/40 text-xs mr-1.5">#{teamRank}</span>
                    )}
                    {team.name}
                  </div>
                  <div className="text-xs text-foreground/45">{team._count.players} นักเตะ</div>
                  {nextFx && (
                    <div className="text-[10px] text-foreground/40 mt-0.5 truncate">
                      นัดต่อไป: vs{" "}
                      {nextFx.homeTeamId === team.id ? nextFx.awayTeam.name : nextFx.homeTeam.name}{" "}
                      ({nextFx.kickoffAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })})
                    </div>
                  )}
                </div>
              </Link>
                );
              })}
            {league.teams.length === 0 && (
              <p className="text-foreground/50 text-sm">ยังไม่มีทีมในลีกนี้</p>
            )}
          </div>
          </div>
        ) : tab === "discipline" && discipline ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
            <div className="rounded-xl border border-white/10 bg-card overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <thead className="text-foreground/45 text-xs">
                  <tr>
                    <th className="text-left py-3 px-4">ทีม</th>
                    <th className="text-center">🟨 เหลือง</th>
                    <th className="text-center">🟥 แดง</th>
                    <th className="text-center">คะแนนแฟร์เพลย์</th>
                    <th className="text-center">เฉลี่ย/นัด</th>
                  </tr>
                </thead>
                <tbody>
                  {discipline.teams.map((row) => (
                    <tr key={row.teamId} className="border-t border-white/5">
                      <td className="py-3 px-4 font-display font-semibold">{row.teamName}</td>
                      <td className="text-center text-yellow-400">{row.yellow}</td>
                      <td className="text-center text-red-400">{row.red}</td>
                      <td className="text-center text-foreground/70">
                        {row.yellow + row.red * 3}
                      </td>
                      <td className="text-center text-foreground/50">
                        {(() => {
                          const played =
                            standings.find((s) => s.teamId === row.teamId)?.played ?? 0;
                          return played > 0
                            ? ((row.yellow + row.red) / played).toFixed(1)
                            : "-";
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-card p-5">
                <h3 className="font-display font-bold mb-3">นักเตะโดนใบโทษสูงสุด</h3>
                <div className="flex flex-col gap-3">
                  {discipline.players.map((p, i) => (
                    <div key={p.playerId} className="flex items-center gap-3 text-sm">
                      <span className="w-5 font-display italic font-extrabold text-foreground/50">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="font-display font-semibold">{p.playerName}</div>
                        <div className="text-xs text-foreground/45">{p.teamName}</div>
                      </div>
                      <span className="text-yellow-400">🟨 {p.yellow}</span>
                      <span className="text-red-400">🟥 {p.red}</span>
                    </div>
                  ))}
                  {discipline.players.length === 0 && (
                    <p className="text-foreground/50 text-sm">ยังไม่มีใบเหลือง-แดงในลีกนี้</p>
                  )}
                </div>
              </div>

              {bannedPlayers.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">⛔ ติดโทษแบนตอนนี้</h3>
                  <div className="flex flex-col gap-2">
                    {bannedPlayers.map((p) => (
                      <Link
                        key={p.id}
                        href={`/leagues/${id}/players/${p.id}`}
                        className="flex items-center justify-between text-sm hover:text-accent"
                      >
                        <span>
                          #{p.number} {p.name}
                        </span>
                        <span className="text-xs text-foreground/45">{p.team.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {discipline.teams.length > 0 && (
                <div className="rounded-xl border border-accent/30 bg-card p-5">
                  <h3 className="font-display font-bold mb-2">🤝 ทีมมารยาทดี</h3>
                  {(() => {
                    const fair = [...discipline.teams].sort(
                      (a, b) => a.red * 3 + a.yellow - (b.red * 3 + b.yellow)
                    )[0];
                    return (
                      <p className="text-sm text-foreground/70">
                        <span className="font-display font-bold text-accent">{fair.teamName}</span>{" "}
                        · เหลือง {fair.yellow} แดง {fair.red}
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        ) : tab === "players" && playerBoards ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <PlayerBoard title="ดาวซัลโว" unit="ประตู" rows={playerBoards.scorers} />
            <PlayerBoard title="ดาวแอสซิสต์" unit="ครั้ง" rows={playerBoards.assists} />
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <h3 className="font-display font-bold mb-3">ใบโทษสูงสุด</h3>
              <div className="flex flex-col gap-3">
                {playerBoards.cards.map((p, i) => (
                  <div key={p.playerId} className="flex items-center gap-3 text-sm">
                    <span className="w-5 font-display italic font-extrabold text-foreground/50">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-display font-semibold">{p.playerName}</div>
                      <div className="text-xs text-foreground/45">{p.teamName}</div>
                    </div>
                    <span className="text-yellow-400">🟨 {p.yellow}</span>
                    <span className="text-red-400">🟥 {p.red}</span>
                  </div>
                ))}
                {playerBoards.cards.length === 0 && (
                  <p className="text-foreground/50 text-sm">ยังไม่มีใบเหลือง-แดง</p>
                )}
              </div>
            </div>
            <PlayerBoard title="MVP สูงสุด" unit="ครั้ง" rows={playerBoards.mvps} />
            <PlayerBoard
              title="ยิง+จ่ายรวม (G+A)"
              unit="ครั้ง"
              rows={playerBoards.contributions}
            />
          </div>
        ) : tab === "stats" ? (
          charts ? (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-8 rounded-xl border border-white/10 bg-card p-5 text-sm">
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">
                    {finishedLeagueMatches.reduce((s, m) => s + m.homeScore + m.awayScore, 0)}
                  </div>
                  <div className="text-xs text-foreground/55">ประตูรวม</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">
                    {finishedLeagueMatches.length > 0
                      ? (
                          finishedLeagueMatches.reduce((s, m) => s + m.homeScore + m.awayScore, 0) /
                          finishedLeagueMatches.length
                        ).toFixed(1)
                      : "0"}
                  </div>
                  <div className="text-xs text-foreground/55">ประตูเฉลี่ย/นัด</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">
                    {
                      finishedLeagueMatches.filter((m) => m.homeScore === 0 || m.awayScore === 0)
                        .length
                    }
                  </div>
                  <div className="text-xs text-foreground/55">นัดที่มีคลีนชีต</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">
                    {finishedLeagueMatches.filter((m) => m.homeScore === m.awayScore).length}
                  </div>
                  <div className="text-xs text-foreground/55">นัดเสมอ</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">
                    {finishedLeagueMatches.reduce((s, m) => s + m.homeScore, 0)}
                    <span className="text-foreground/40 text-base mx-1">/</span>
                    {finishedLeagueMatches.reduce((s, m) => s + m.awayScore, 0)}
                  </div>
                  <div className="text-xs text-foreground/55">ประตูเหย้า/เยือน</div>
                </div>
                {(() => {
                  const totalSpectators = matches.reduce((s, m) => s + (m.spectators ?? 0), 0);
                  return totalSpectators > 0 ? (
                    <div>
                      <div className="font-display italic font-extrabold text-2xl text-accent">
                        {totalSpectators.toLocaleString()}
                      </div>
                      <div className="text-xs text-foreground/55">ผู้ชมรวม</div>
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">ประตูรวมต่อนัด</h3>
                  <GoalsBarChart rounds={charts.rounds} values={charts.goalsPerRound} />
                </div>
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">แต้มสะสม Top 5</h3>
                  <PointsLineChart rounds={charts.rounds} series={charts.topTeams} />
                </div>
                <div className="rounded-xl border border-white/10 bg-card p-5 lg:col-span-2">
                  <h3 className="font-display font-bold mb-3">ประตูรวมต่อทีม</h3>
                  <GoalsBarChart
                    rounds={charts.teamGoals.map((t) => t.abbr)}
                    values={charts.teamGoals.map((t) => t.goals)}
                  />
                </div>
                {goalMinutes.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-card p-5 lg:col-span-2">
                    <h3 className="font-display font-bold mb-3">ช่วงนาทีเกิดประตูทั้งลีก</h3>
                    <GoalsBarChart
                      rounds={["1-15", "16-30", "31-45", "46-60", "61-75", "76+"]}
                      values={heatBuckets}
                    />
                  </div>
                )}
              </div>
              {records.length > 0 && (
                <div>
                  <h3 className="font-display font-bold mb-3">บันทึกฤดูกาล</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {records.map((r) => (
                      <div key={r.label} className="rounded-xl border border-white/10 bg-card p-4">
                        <div className="text-xs text-foreground/50">{r.label}</div>
                        <div className="mt-1 font-display font-bold text-sm">{r.value}</div>
                        {r.sub && <div className="text-xs text-accent mt-1">{r.sub}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-foreground/50 text-sm">ยังไม่มีผลการแข่งขันให้แสดงกราฟ</p>
          )
        ) : tab === "news" ? (
          <div className="space-y-4 max-w-2xl">
            {news.map((n) => (
              <div key={n.id} className="rounded-xl border border-white/10 bg-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display font-bold">
                    {n.pinned && <span className="text-accent mr-1">📌</span>}
                    {n.title}
                  </h3>
                  <span className="text-xs text-foreground/45 shrink-0">
                    {n.createdAt.toLocaleDateString("th-TH", { dateStyle: "medium" })}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground/70 whitespace-pre-line">{n.body}</p>
              </div>
            ))}
            {news.length === 0 && (
              <p className="text-foreground/50 text-sm">ยังไม่มีประกาศจากผู้จัดลีก</p>
            )}
          </div>
        ) : matches.length === 0 ? (
          <p className="text-foreground/50 text-sm">ยังไม่มีตารางแข่งสำหรับลีกนี้</p>
        ) : tab === "standings" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {[
                { label: "รวม", href: `/leagues/${id}?tab=standings`, active: !sideView },
                {
                  label: "เหย้า",
                  href: `/leagues/${id}?tab=standings&side=home`,
                  active: sideView === "HOME",
                },
                {
                  label: "เยือน",
                  href: `/leagues/${id}?tab=standings&side=away`,
                  active: sideView === "AWAY",
                },
              ].map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className={`rounded-full px-3 py-1 text-xs ${
                    t.active ? "bg-accent text-black font-semibold" : "bg-white/5 text-foreground/60"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
              {!sideView && maxFinishedRound >= 2 && (
                <form method="get" className="flex items-center gap-2 ml-auto">
                  <input type="hidden" name="tab" value="standings" />
                  <select
                    name="asof"
                    defaultValue={asofRound ?? ""}
                    className="rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs outline-none focus:border-accent"
                  >
                    <option value="">ตารางปัจจุบัน</option>
                    {Array.from({ length: maxFinishedRound - 1 }, (_, i) => i + 1).map((r) => (
                      <option key={r} value={r}>
                        หลังนัดที่ {r}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-md bg-white/10 px-3 py-1 text-xs">
                    ดู
                  </button>
                </form>
              )}
              {asofRound && (
                <span className="text-xs text-accent">ตารางหลังจบนัดที่ {asofRound}</span>
              )}
            </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6">
            <div className="rounded-xl border border-white/10 bg-card overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-foreground/45 text-xs">
                  <tr>
                    <th className="text-left py-3 px-4">#</th>
                    <th className="text-left">ทีม</th>
                    <th className="text-center">แข่ง</th>
                    <th className="text-center">ชนะ</th>
                    <th className="text-center">เสมอ</th>
                    <th className="text-center">แพ้</th>
                    <th className="text-center">ได้</th>
                    <th className="text-center">เสีย</th>
                    <th className="text-center">+/-</th>
                    <th className="text-center">แต้ม</th>
                    <th className="text-center">แต้ม/นัด</th>
                    <th className="text-center">ฟอร์ม</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => (
                    <tr
                      key={row.teamId}
                      className={`border-t border-white/5 hover:bg-accent/5 transition-colors ${
                        zonesOn && i < league.promotedCount
                          ? "border-l-2 border-l-accent"
                          : zonesOn &&
                              league.relegatedCount > 0 &&
                              i >= standings.length - league.relegatedCount
                            ? "border-l-2 border-l-red-500"
                            : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-display font-bold">
                        {i + 1}
                        {(() => {
                          const d = movement.get(row.teamId) ?? 0;
                          if (d > 0)
                            return <span className="ml-1 text-[10px] text-accent">▲{d}</span>;
                          if (d < 0)
                            return <span className="ml-1 text-[10px] text-red-400">▼{-d}</span>;
                          return null;
                        })()}
                      </td>
                      <td className="font-display font-semibold">
                        <Link
                          href={`/leagues/${id}/teams/${row.teamId}`}
                          className="hover:text-accent"
                        >
                          {row.teamName}
                        </Link>
                      </td>
                      <td className="text-center text-foreground/70">{row.played}</td>
                      <td className="text-center text-foreground/70">{row.won}</td>
                      <td className="text-center text-foreground/70">{row.drawn}</td>
                      <td className="text-center text-foreground/70">{row.lost}</td>
                      <td className="text-center text-foreground/50">{row.goalsFor}</td>
                      <td className="text-center text-foreground/50">{row.goalsAgainst}</td>
                      <td className="text-center text-foreground/70">
                        {row.goalDiff >= 0 ? "+" : ""}
                        {row.goalDiff}
                      </td>
                      <td className="text-center font-display italic font-extrabold text-accent">
                        {row.points}
                      </td>
                      <td className="text-center text-foreground/50 text-xs">
                        {row.played > 0 ? (row.points / row.played).toFixed(2) : "-"}
                      </td>
                      <td>
                        <div className="flex gap-1 justify-center py-1">
                          {row.form.map((f, j) => (
                            <span
                              key={j}
                              className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center ${FORM_LABEL[f].className}`}
                            >
                              {FORM_LABEL[f].t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-5 px-4 py-3 text-xs text-foreground/45 border-t border-white/5 min-w-[560px]">
                {zonesOn && league.promotedCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-accent inline-block" /> เข้ารอบแชมเปียนส์
                  </span>
                )}
                {zonesOn && league.relegatedCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> ตกชั้น
                  </span>
                )}
                {sideView && (
                  <span>{sideView === "HOME" ? "เฉพาะผลงานเจ้าบ้าน" : "เฉพาะผลงานทีมเยือน"}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {upcomingFixtures.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">โปรแกรมนัดที่ {currentRound}</h3>
                  <div className="flex flex-col gap-2">
                    {upcomingFixtures.map((fx) => (
                      <Link
                        key={fx.id}
                        href={`/matches/${fx.id}`}
                        className="grid grid-cols-[1fr_56px_1fr] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                      >
                        <span className="text-right">{fx.homeTeam.name}</span>
                        <span className="text-center rounded bg-accent text-black text-xs font-bold py-1">
                          {fx.status === "SCHEDULED"
                            ? fx.kickoffAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                            : `${fx.homeScore}-${fx.awayScore}`}
                        </span>
                        <span>{fx.awayTeam.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {finishedLeagueMatches.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">ผลล่าสุด</h3>
                  <div className="flex flex-col gap-2">
                    {[...finishedLeagueMatches]
                      .sort((a, b) => b.kickoffAt.getTime() - a.kickoffAt.getTime())
                      .slice(0, 3)
                      .map((m) => (
                        <Link
                          key={m.id}
                          href={`/matches/${m.id}`}
                          className="grid grid-cols-[1fr_56px_1fr] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                        >
                          <span className="text-right truncate">{m.homeTeam.name}</span>
                          <span className="text-center font-display font-bold">
                            {m.homeScore}-{m.awayScore}
                          </span>
                          <span className="truncate">{m.awayTeam.name}</span>
                        </Link>
                      ))}
                  </div>
                </div>
              )}

              {topAssists.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">ดาวแอสซิสต์</h3>
                  <div className="flex flex-col gap-3">
                    {topAssists.map((sc, i) => (
                      <div key={sc.playerId} className="flex items-center gap-3 text-sm">
                        <span className="w-5 font-display italic font-extrabold text-foreground/50">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="font-display font-semibold">{sc.playerName}</div>
                          <div className="text-xs text-foreground/45">{sc.teamName}</div>
                        </div>
                        <span className="font-display italic font-extrabold text-accent text-lg">
                          {sc.goals}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topScorers.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card p-5">
                  <h3 className="font-display font-bold mb-3">ดาวซัลโว</h3>
                  <div className="flex flex-col gap-3">
                    {topScorers.map((sc, i) => (
                      <div key={sc.playerId} className="flex items-center gap-3 text-sm">
                        <span className="w-5 font-display italic font-extrabold text-foreground/50">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="font-display font-semibold">{sc.playerName}</div>
                          <div className="text-xs text-foreground/45">{sc.teamName}</div>
                        </div>
                        <span className="font-display italic font-extrabold text-accent text-lg">
                          {sc.goals}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {finishedLeagueMatches.length > 0 && (
              <div className="lg:col-span-2 rounded-xl border border-white/10 bg-card overflow-x-auto">
                <h3 className="font-display font-bold px-4 pt-4">ตารางผลเหย้า-เยือน</h3>
                <p className="px-4 pt-1 text-xs text-foreground/45">แถว = เจ้าบ้าน · คอลัมน์ = ทีมเยือน</p>
                <table className="text-[11px] m-4 mt-3">
                  <thead>
                    <tr>
                      <th className="p-1.5 text-left text-foreground/45">เหย้า \ เยือน</th>
                      {league.teams.map((t) => (
                        <th key={t.id} className="p-1.5 text-foreground/60 font-display">
                          {t.abbr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {league.teams.map((home) => (
                      <tr key={home.id} className="border-t border-white/5">
                        <td className="p-1.5 font-display font-semibold text-foreground/80">
                          {home.abbr}
                        </td>
                        {league.teams.map((away) => {
                          if (home.id === away.id) {
                            return <td key={away.id} className="p-1.5 text-center bg-white/5" />;
                          }
                          const m = crossScore.get(`${home.id}:${away.id}`);
                          return (
                            <td key={away.id} className="p-1.5 text-center">
                              {m ? (
                                <Link href={`/matches/${m.id}`} className="hover:text-accent">
                                  {m.homeScore}-{m.awayScore}
                                </Link>
                              ) : (
                                <span className="text-foreground/25">·</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
        ) : (
          <div className="space-y-6">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="fixtures" />
              <select
                name="round"
                defaultValue={roundFilter ?? ""}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">ทุกนัด</option>
                {Array.from(matchesByRound.keys()).map((r) => (
                  <option key={r} value={r}>
                    นัดที่ {r}
                  </option>
                ))}
              </select>
              <select
                name="team"
                defaultValue={teamFilter ?? ""}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">ทุกทีม</option>
                {league.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
                ดู
              </button>
            </form>
            {Array.from(matchesByRound.entries())
              .filter(([round]) => roundFilter === null || round === roundFilter)
              .map(([round, roundMatches]) => {
                const shown = teamFilter
                  ? roundMatches.filter(
                      (m) => m.homeTeamId === teamFilter || m.awayTeamId === teamFilter
                    )
                  : roundMatches;
                if (shown.length === 0) return null;
                return (
              <div key={round}>
                <h3 className="text-sm text-foreground/50 mb-2">
                  {STAGE_LABEL[roundMatches[0].stage] ?? `นัดที่ ${round}`}
                </h3>
                <div className="space-y-2">
                  {shown.map((m) => {
                    const isToday = m.kickoffAt.toDateString() === new Date().toDateString();
                    return (
                    <Link
                      key={m.id}
                      href={`/matches/${m.id}`}
                      className={`flex items-center justify-between rounded-md bg-card border px-4 py-3 hover:border-accent/50 ${
                        isToday ? "border-accent/50" : "border-white/10"
                      }`}
                    >
                      <span>{m.homeTeam.name}</span>
                      <span className="text-foreground/50 text-sm flex items-center gap-2">
                        {isToday && m.status === "SCHEDULED" && (
                          <span className="text-[10px] rounded-full bg-accent/15 text-accent px-2 py-0.5">
                            วันนี้
                          </span>
                        )}
                        {m.status === "SCHEDULED"
                          ? m.kickoffAt.toLocaleDateString("th-TH")
                          : `${m.homeScore} - ${m.awayScore}`}
                      </span>
                      <span>{m.awayTeam.name}</span>
                    </Link>
                    );
                  })}
                </div>
              </div>
                );
              })}
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}

function PlayerBoard({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: { playerId: string; playerName: string; teamName: string; goals: number }[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <h3 className="font-display font-bold mb-3">{title}</h3>
      <div className="flex flex-col gap-3">
        {rows.map((sc, i) => (
          <div key={sc.playerId} className="flex items-center gap-3 text-sm">
            <span className="w-5 font-display italic font-extrabold text-foreground/50">
              {i + 1}
            </span>
            <div className="flex-1">
              <div className="font-display font-semibold">{sc.playerName}</div>
              <div className="text-xs text-foreground/45">{sc.teamName}</div>
            </div>
            <span className="font-display italic font-extrabold text-accent">
              {sc.goals} <span className="text-xs text-foreground/45 not-italic font-normal">{unit}</span>
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-foreground/50 text-sm">ยังไม่มีข้อมูล</p>}
      </div>
    </div>
  );
}
