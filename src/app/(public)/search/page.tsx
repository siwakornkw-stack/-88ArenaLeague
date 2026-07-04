import Link from "next/link";
import { prisma } from "@/lib/db";
import { MobileNav } from "@/components/mobile-nav";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const [teams, players, leagues] =
    query.length >= 2
      ? await Promise.all([
          prisma.team.findMany({
            where: { name: { contains: query, mode: "insensitive" } },
            include: { league: true, _count: { select: { players: true } } },
            take: 20,
          }),
          prisma.player.findMany({
            where: { name: { contains: query, mode: "insensitive" } },
            include: { team: { include: { league: true } } },
            take: 20,
          }),
          prisma.league.findMany({
            where: { name: { contains: query, mode: "insensitive" }, status: { not: "DRAFT" } },
            include: { teams: { select: { id: true } } },
            take: 10,
          }),
        ])
      : [[], [], []];

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
        <form method="get" className="mt-4 flex gap-2 max-w-md">
          <input
            name="q"
            defaultValue={query}
            placeholder="พิมพ์ชื่อทีมหรือนักเตะ (อย่างน้อย 2 ตัวอักษร)"
            className="flex-1 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm">
            ค้นหา
          </button>
        </form>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-8">
        {query.length >= 2 && teams.length === 0 && players.length === 0 && leagues.length === 0 && (
          <p className="text-foreground/50 text-sm">ไม่พบผลลัพธ์สำหรับ &quot;{query}&quot;</p>
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
                  className="rounded-xl border border-white/10 bg-card p-4 flex items-center gap-3 hover:border-accent/50"
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
                  className="rounded-xl border border-white/10 bg-card p-4 flex items-center gap-3 hover:border-accent/50"
                >
                  <span
                    className="w-10 h-10 rounded-full shrink-0 grid place-items-center font-display font-bold text-sm"
                    style={{ backgroundColor: p.team.color }}
                  >
                    {p.number}
                  </span>
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
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
