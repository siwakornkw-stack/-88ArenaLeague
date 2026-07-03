import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { generateSchedule } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "จัดตารางแล้ว",
  IN_PROGRESS: "กำลังแข่งขัน",
  FINISHED: "จบฤดูกาล",
};

export default async function LeagueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "fixtures" } = await searchParams;

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: true },
  });
  if (!league) notFound();

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

  const standings = tab === "standings" ? await computeStandings(id) : [];
  const generateWithId = generateSchedule.bind(null, id);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl">{league.name}</h1>
        <p className="text-foreground/60 mt-1">
          ฤดูกาล {league.seasonYear} · {league.teams.length} ทีม ·{" "}
          {STATUS_LABEL[league.status]}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg bg-card border border-white/10 p-6 max-w-sm">
          <p className="text-sm text-foreground/70 mb-4">
            ยังไม่มีตารางแข่ง สร้างตารางแบบพบกันหมดจากทีมทั้งหมด {league.teams.length} ทีม
          </p>
          <form action={generateWithId}>
            <button
              type="submit"
              className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm"
            >
              สร้างตารางแข่งขัน
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="flex gap-2 border-b border-white/10">
            <Link
              href={`/admin/leagues/${id}?tab=fixtures`}
              className={`px-4 py-2 text-sm ${tab === "fixtures" ? "border-b-2 border-accent text-accent" : "text-foreground/60"}`}
            >
              ตารางแข่ง
            </Link>
            <Link
              href={`/admin/leagues/${id}?tab=standings`}
              className={`px-4 py-2 text-sm ${tab === "standings" ? "border-b-2 border-accent text-accent" : "text-foreground/60"}`}
            >
              ตารางคะแนน
            </Link>
          </div>

          {tab === "standings" ? (
            <table className="w-full text-sm">
              <thead className="text-foreground/50 text-left">
                <tr>
                  <th className="py-2">ทีม</th>
                  <th className="text-center">แข่ง</th>
                  <th className="text-center">ชนะ</th>
                  <th className="text-center">เสมอ</th>
                  <th className="text-center">แพ้</th>
                  <th className="text-center">ได้-เสีย</th>
                  <th className="text-center">คะแนน</th>
                  <th className="text-center">ฟอร์ม 5 นัด</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => (
                  <tr key={row.teamId} className="border-t border-white/5">
                    <td className="py-2">
                      {i + 1}. {row.teamName}
                    </td>
                    <td className="text-center">{row.played}</td>
                    <td className="text-center">{row.won}</td>
                    <td className="text-center">{row.drawn}</td>
                    <td className="text-center">{row.lost}</td>
                    <td className="text-center">
                      {row.goalsFor}-{row.goalsAgainst} ({row.goalDiff >= 0 ? "+" : ""}
                      {row.goalDiff})
                    </td>
                    <td className="text-center font-semibold">{row.points}</td>
                    <td className="text-center text-foreground/60">{row.form.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="space-y-6">
              {Array.from(matchesByRound.entries()).map(([round, roundMatches]) => (
                <div key={round}>
                  <h3 className="text-sm text-foreground/50 mb-2">นัดที่ {round}</h3>
                  <div className="space-y-2">
                    {roundMatches.map((m) => (
                      <Link
                        key={m.id}
                        href={`/admin/matches/${m.id}`}
                        className="flex items-center justify-between rounded-md bg-card border border-white/10 px-4 py-3 hover:border-accent/50"
                      >
                        <span>{m.homeTeam.name}</span>
                        <span className="text-foreground/50 text-sm">
                          {m.status === "SCHEDULED"
                            ? m.kickoffAt.toLocaleDateString("th-TH")
                            : `${m.homeScore} - ${m.awayScore}`}
                        </span>
                        <span>{m.awayTeam.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
