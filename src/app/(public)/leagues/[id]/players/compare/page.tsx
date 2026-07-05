import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MobileNav } from "@/components/mobile-nav";

async function playerStats(playerId: string) {
  const [apps, goals, assists, yellows, reds, mvps] = await Promise.all([
    prisma.matchLineup.count({
      where: { playerId, match: { status: { in: ["LIVE", "FINISHED"] } } },
    }),
    prisma.matchEvent.count({ where: { playerId, type: "GOAL" } }),
    prisma.matchEvent.count({ where: { relatedPlayerId: playerId, type: "GOAL" } }),
    prisma.matchEvent.count({ where: { playerId, type: "YELLOW_CARD" } }),
    prisma.matchEvent.count({ where: { playerId, type: "RED_CARD" } }),
    prisma.match.count({ where: { mvpPlayerId: playerId } }),
  ]);
  return { apps, goals, assists, yellows, reds, mvps };
}

export default async function PlayersComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id } = await params;
  const { a, b } = await searchParams;

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) notFound();

  const players = await prisma.player.findMany({
    where: { team: { leagueId: id } },
    include: { team: true },
    orderBy: [{ team: { name: "asc" } }, { number: "asc" }],
  });

  const pA = players.find((p) => p.id === a) ?? null;
  const pB = players.find((p) => p.id === b) ?? null;
  const ready = pA && pB && pA.id !== pB.id;

  const [sA, sB] = ready
    ? await Promise.all([playerStats(pA.id), playerStats(pB.id)])
    : [null, null];

  const rows =
    sA && sB
      ? [
          { label: "ลงสนาม", a: sA.apps, b: sB.apps },
          { label: "ประตู", a: sA.goals, b: sB.goals },
          { label: "แอสซิสต์", a: sA.assists, b: sB.assists },
          { label: "G+A", a: sA.goals + sA.assists, b: sB.goals + sB.assists },
          { label: "ใบเหลือง", a: sA.yellows, b: sB.yellows },
          { label: "ใบแดง", a: sA.reds, b: sB.reds },
          { label: "MVP", a: sA.mvps, b: sB.mvps },
        ]
      : [];

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "👥", label: "นักเตะ", href: `/leagues/${id}?tab=players` },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 md:px-16 py-4 text-sm">
        <Link href={`/leagues/${id}?tab=players`} className="text-foreground/60 hover:text-accent">
          ← {league.name}
        </Link>
      </div>

      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
          เปรียบเทียบ<span className="text-accent">นักเตะ</span>
        </h1>
        <form method="get" className="mt-4 flex flex-wrap items-center gap-2 max-w-xl">
          <select
            name="a"
            defaultValue={pA?.id ?? ""}
            className="flex-1 min-w-44 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">- นักเตะคนแรก -</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.team.abbr} #{p.number} {p.name}
              </option>
            ))}
          </select>
          <span className="text-foreground/40 text-sm">vs</span>
          <select
            name="b"
            defaultValue={pB?.id ?? ""}
            className="flex-1 min-w-44 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">- นักเตะคนที่สอง -</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.team.abbr} #{p.number} {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm">
            เปรียบเทียบ
          </button>
        </form>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1">
        {!ready ? (
          <p className="text-foreground/50 text-sm">เลือกนักเตะ 2 คนที่ต่างกัน</p>
        ) : (
          <div className="rounded-xl border border-white/10 bg-card overflow-hidden max-w-2xl">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center px-5 py-4 border-b border-white/10 text-sm">
              <div>
                <div className="font-display font-bold">{pA.name}</div>
                <div className="text-xs text-foreground/45">
                  {pA.team.name} · #{pA.number} · {pA.position}
                </div>
              </div>
              <span className="text-foreground/40 px-4">vs</span>
              <div className="text-right">
                <div className="font-display font-bold">{pB.name}</div>
                <div className="text-xs text-foreground/45">
                  {pB.team.name} · #{pB.number} · {pB.position}
                </div>
              </div>
            </div>
            {rows.map((r) => (
              <div
                key={r.label}
                className="grid grid-cols-[1fr_auto_1fr] items-center px-5 py-2.5 border-t border-white/5 text-sm"
              >
                <span className={`font-display font-bold ${r.a >= r.b ? "text-accent" : ""}`}>
                  {r.a}
                </span>
                <span className="text-xs text-foreground/50 px-4">{r.label}</span>
                <span className={`font-display font-bold text-right ${r.b >= r.a ? "text-accent" : ""}`}>
                  {r.b}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
