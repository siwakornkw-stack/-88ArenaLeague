import Link from "next/link";
import { prisma } from "@/lib/db";
import { getFeaturedLeagues } from "@/lib/featuredLeagues";
import { MobileNav } from "@/components/mobile-nav";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; league?: string }>;
}) {
  const { q = "", league: leagueParam = "" } = await searchParams;
  const query = q.trim();
  const allLeagues = await prisma.league.findMany({
    where: { status: { not: "DRAFT" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });
  const leagueScope = allLeagues.some((l) => l.id === leagueParam) ? leagueParam : null;

  const [teams, players, leagues, venueMatches, coachTeams] =
    query.length >= 2
      ? await Promise.all([
          prisma.team.findMany({
            where: {
              name: { contains: query, mode: "insensitive" },
              ...(leagueScope ? { leagueId: leagueScope } : {}),
            },
            include: { league: true, _count: { select: { players: true } } },
            take: 20,
          }),
          prisma.player.findMany({
            where: {
              name: { contains: query, mode: "insensitive" },
              ...(leagueScope ? { team: { leagueId: leagueScope } } : {}),
            },
            include: { team: { include: { league: true } } },
            take: 20,
          }),
          prisma.league.findMany({
            where: {
              name: { contains: query, mode: "insensitive" },
              status: { not: "DRAFT" },
              hidden: false,
            },
            include: { teams: { select: { id: true } } },
            take: 10,
          }),
          prisma.match.findMany({
            where: { venue: { contains: query, mode: "insensitive" } },
            include: { homeTeam: true, awayTeam: true },
            orderBy: { kickoffAt: "desc" },
            take: 10,
          }),
          prisma.team.findMany({
            where: { coachName: { contains: query, mode: "insensitive" } },
            include: { league: true },
            take: 10,
          }),
        ])
      : [[], [], [], [], []];

  const suggestions = query.length < 2 ? await getFeaturedLeagues(6) : [];

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "🔍", label: "ค้นหา", href: "/search", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
          ค้นหา<span className="text-accent">ทีมและนักเตะ</span>
        </h1>
        <form method="get" className="mt-4 flex flex-wrap gap-2 max-w-xl">
          <input
            name="q"
            defaultValue={query}
            placeholder="พิมพ์ชื่อทีมหรือนักเตะ (อย่างน้อย 2 ตัวอักษร)"
            className="flex-1 min-w-48 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            name="league"
            defaultValue={leagueScope ?? ""}
            className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">ทุกลีก</option>
            {allLeagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm">
            ค้นหา
          </button>
        </form>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-8">
        {query.length >= 2 && (
          <p className="text-sm text-foreground/50">
            พบ {leagues.length + teams.length + players.length + venueMatches.length} ผลลัพธ์:
            ลีก {leagues.length} · ทีม {teams.length} · นักเตะ {players.length} · แมตช์{" "}
            {venueMatches.length}
          </p>
        )}
        {suggestions.length > 0 && (
          <div>
            <h2 className="text-sm text-foreground/50 mb-3">ลองดูลีกยอดนิยม:</h2>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((lg) => (
                <Link
                  key={lg.id}
                  href={`/leagues/${lg.id}`}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-foreground/75 hover:border-accent/50 hover:text-accent"
                >
                  {lg.name}
                </Link>
              ))}
            </div>
          </div>
        )}
        {query.length >= 2 &&
          teams.length === 0 &&
          players.length === 0 &&
          leagues.length === 0 &&
          venueMatches.length === 0 && (
            <div className="text-foreground/50 text-sm space-y-1">
              <p>ไม่พบผลลัพธ์สำหรับ &quot;{query}&quot;</p>
              {await (async () => {
                const [teamTotal, playerTotal] = await Promise.all([
                  prisma.team.count({ where: { league: { status: { not: "DRAFT" } } } }),
                  prisma.player.count({ where: { team: { league: { status: { not: "DRAFT" } } } } }),
                ]);
                return (
                  <p className="text-xs text-foreground/40">
                    ระบบมี {teamTotal} ทีม และ {playerTotal} นักเตะ — ลองพิมพ์คำสั้นลง
                    หรือเปลี่ยนเป็น &quot;ทุกลีก&quot;
                  </p>
                );
              })()}
            </div>
          )}

        {leagues.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-3">ลีก ({leagues.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {leagues.map((lg) => (
                <Link
                  key={lg.id}
                  href={`/leagues/${lg.id}`}
                  className="rounded-xl border border-white/10 bg-card p-4 hover:border-accent/50"
                >
                  <div className="font-display font-semibold">{lg.name}</div>
                  <div className="text-xs text-foreground/45">
                    ฤดูกาล {lg.seasonYear} · {lg.teams.length} ทีม
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {teams.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-3">ทีม ({teams.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((team) => (
                <Link
                  key={team.id}
                  href={`/leagues/${team.leagueId}/teams/${team.id}`}
                  className="hover-lift rounded-xl border border-white/10 bg-card p-4 flex items-center gap-3 hover:border-accent/50"
                >
                  <span
                    className="w-10 h-10 rounded-full shrink-0 grid place-items-center font-display font-bold text-xs"
                    style={{ backgroundColor: team.color }}
                  >
                    {team.abbr}
                  </span>
                  <div>
                    <div className="font-display font-semibold">{team.name}</div>
                    <div className="text-xs text-foreground/45">
                      {team.league.name} · {team._count.players} นักเตะ
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {players.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-3">นักเตะ ({players.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {players.map((p) => (
                <Link
                  key={p.id}
                  href={`/leagues/${p.team.leagueId}/players/${p.id}`}
                  className="hover-lift rounded-xl border border-white/10 bg-card p-4 flex items-center gap-3 hover:border-accent/50"
                >
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photoUrl}
                      alt={p.name}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className="w-10 h-10 rounded-full shrink-0 grid place-items-center font-display font-bold text-sm"
                      style={{ backgroundColor: p.team.color }}
                    >
                      {p.number}
                    </span>
                  )}
                  <div>
                    <div className="font-display font-semibold">{p.name}</div>
                    <div className="text-xs text-foreground/45">
                      {p.team.name} · {p.team.league.name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        {coachTeams.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-3">โค้ช ({coachTeams.length})</h2>
            <div className="flex flex-col gap-2 max-w-md">
              {coachTeams.map((t) => (
                <Link
                  key={t.id}
                  href={`/leagues/${t.leagueId}/teams/${t.id}`}
                  className="rounded-lg bg-card border border-white/10 px-3 py-2 text-sm hover:border-accent/50"
                >
                  🧑‍🏫 {t.coachName} — <span className="text-foreground/60">{t.name} · {t.league.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {venueMatches.length > 0 && (
          <div>
            <h2 className="font-display font-bold mb-3">แมตช์ในสนาม &quot;{query}&quot; ({venueMatches.length})</h2>
            <div className="flex flex-col gap-2 max-w-2xl">
              {venueMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="grid grid-cols-[1fr_56px_1fr_auto] items-center gap-2 rounded-lg bg-card border border-white/10 px-3 py-2 text-sm hover:border-accent/50"
                >
                  <span className="text-right truncate">{m.homeTeam.name}</span>
                  <span className="text-center font-display font-bold">
                    {m.status === "SCHEDULED" ? "vs" : `${m.homeScore}-${m.awayScore}`}
                  </span>
                  <span className="truncate">{m.awayTeam.name}</span>
                  <span className="text-xs text-foreground/40">📍 {m.venue}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
