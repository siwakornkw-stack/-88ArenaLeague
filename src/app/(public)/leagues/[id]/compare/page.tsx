import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { TeamBadge } from "@/components/team-badge";
import { MobileNav } from "@/components/mobile-nav";

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id } = await params;
  const { a, b } = await searchParams;

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { orderBy: { name: "asc" } } },
  });
  if (!league) notFound();

  const teamA = league.teams.find((t) => t.id === a) ?? null;
  const teamB = league.teams.find((t) => t.id === b) ?? null;
  const ready = teamA && teamB && teamA.id !== teamB.id;

  const standings = ready ? await computeStandings(id) : [];
  const rowA = ready ? standings.find((r) => r.teamId === teamA.id) ?? null : null;
  const rowB = ready ? standings.find((r) => r.teamId === teamB.id) ?? null : null;
  const rankA = ready ? standings.findIndex((r) => r.teamId === teamA.id) + 1 : 0;
  const rankB = ready ? standings.findIndex((r) => r.teamId === teamB.id) + 1 : 0;

  const h2h = ready
    ? await prisma.match.findMany({
        where: {
          leagueId: id,
          status: "FINISHED",
          OR: [
            { homeTeamId: teamA.id, awayTeamId: teamB.id },
            { homeTeamId: teamB.id, awayTeamId: teamA.id },
          ],
        },
        include: { homeTeam: true, awayTeam: true },
        orderBy: { kickoffAt: "desc" },
        take: 5,
      })
    : [];

  let winsA = 0;
  let draws = 0;
  let winsB = 0;
  for (const m of h2h) {
    const goalsA = m.homeTeamId === teamA?.id ? m.homeScore : m.awayScore;
    const goalsB = m.homeTeamId === teamA?.id ? m.awayScore : m.homeScore;
    if (goalsA > goalsB) winsA++;
    else if (goalsA < goalsB) winsB++;
    else draws++;
  }

  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "👥", label: "ทีม", href: `/leagues/${id}?tab=teams` },
    { icon: "⚖", label: "เปรียบเทียบ", href: `/leagues/${id}/compare`, active: true },
  ];

  const rows: { label: string; a: string; b: string }[] =
    rowA && rowB
      ? [
          { label: "อันดับ", a: `${rankA}`, b: `${rankB}` },
          { label: "แต้ม", a: `${rowA.points}`, b: `${rowB.points}` },
          { label: "ชนะ/เสมอ/แพ้", a: `${rowA.won}/${rowA.drawn}/${rowA.lost}`, b: `${rowB.won}/${rowB.drawn}/${rowB.lost}` },
          { label: "ได้-เสีย", a: `${rowA.goalsFor}-${rowA.goalsAgainst}`, b: `${rowB.goalsFor}-${rowB.goalsAgainst}` },
        ]
      : [];

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 md:px-16 py-4 text-sm">
        <Link href={`/leagues/${id}?tab=teams`} className="text-foreground/60 hover:text-accent">
          ← {league.name}
        </Link>
      </div>

      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8">
        <h1 className="font-display italic font-black text-2xl md:text-4xl text-foreground">
          เปรียบเทียบ<span className="text-accent">ทีม</span>
        </h1>
        <form method="get" className="mt-4 flex flex-wrap items-center gap-2 max-w-xl">
          <select
            name="a"
            defaultValue={teamA?.id ?? ""}
            className="flex-1 min-w-40 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">- ทีมแรก -</option>
            {league.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <span className="text-foreground/40 text-sm">vs</span>
          <select
            name="b"
            defaultValue={teamB?.id ?? ""}
            className="flex-1 min-w-40 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">- ทีมที่สอง -</option>
            {league.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent text-black font-semibold px-5 py-2 text-sm">
            เปรียบเทียบ
          </button>
        </form>
      </div>

      <div className="px-6 md:px-16 py-8 flex-1 space-y-6">
        {!ready ? (
          <p className="text-foreground/50 text-sm">เลือก 2 ทีมที่ต่างกันเพื่อเปรียบเทียบ</p>
        ) : (
          <>
            <div className="rounded-xl border border-white/10 bg-card overflow-hidden max-w-2xl">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center px-5 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <TeamBadge
                    abbr={teamA.abbr}
                    color={teamA.color}
                    logoUrl={teamA.logoUrl}
                    className="w-10 h-10 text-xs"
                  />
                  <span className="font-display font-bold">{teamA.name}</span>
                </div>
                <span className="text-foreground/40 text-sm px-4">vs</span>
                <div className="flex items-center gap-3 justify-end">
                  <span className="font-display font-bold text-right">{teamB.name}</span>
                  <TeamBadge
                    abbr={teamB.abbr}
                    color={teamB.color}
                    logoUrl={teamB.logoUrl}
                    className="w-10 h-10 text-xs"
                  />
                </div>
              </div>
              {rows.map((r) => (
                <div
                  key={r.label}
                  className="grid grid-cols-[1fr_auto_1fr] items-center px-5 py-3 border-t border-white/5 text-sm"
                >
                  <span className="font-display font-bold text-accent">{r.a}</span>
                  <span className="text-xs text-foreground/50 px-4">{r.label}</span>
                  <span className="font-display font-bold text-accent text-right">{r.b}</span>
                </div>
              ))}
              {rowA && rowB && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center px-5 py-3 border-t border-white/5 text-sm">
                  <div className="flex gap-1">
                    {rowA.form.map((f, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold grid place-items-center ${FORM_LABEL[f].className}`}>
                        {FORM_LABEL[f].t}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-foreground/50 px-4">ฟอร์ม 5 นัด</span>
                  <div className="flex gap-1 justify-end">
                    {rowB.form.map((f, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold grid place-items-center ${FORM_LABEL[f].className}`}>
                        {FORM_LABEL[f].t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-card p-5 max-w-2xl">
              <h2 className="font-display font-bold mb-3">ผลเจอกัน (ล่าสุด {h2h.length} นัด)</h2>
              <div className="flex justify-center gap-8 text-center text-sm mb-4">
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">{winsA}</div>
                  <div className="text-xs text-foreground/50">{teamA.name} ชนะ</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-foreground/70">{draws}</div>
                  <div className="text-xs text-foreground/50">เสมอ</div>
                </div>
                <div>
                  <div className="font-display italic font-extrabold text-2xl text-accent">{winsB}</div>
                  <div className="text-xs text-foreground/50">{teamB.name} ชนะ</div>
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
                {h2h.length === 0 && (
                  <p className="text-foreground/50 text-sm">ยังไม่เคยเจอกัน</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
