import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";

export default async function PrintLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) notFound();

  const [standings, matches] = await Promise.all([
    computeStandings(id),
    prisma.match.findMany({
      where: { leagueId: id, status: "FINISHED" },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
    }),
  ]);

  return (
    <div className="min-h-screen bg-white text-black p-8 font-sans text-sm">
      <h1 className="text-2xl font-bold">
        {league.name} · ฤดูกาล {league.seasonYear}
      </h1>
      <p className="text-neutral-500 text-xs mb-6">
        พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} ·
        88ArenaLeague
      </p>

      <h2 className="font-bold mb-2">ตารางคะแนน</h2>
      <table className="w-full border-collapse mb-8">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1 pr-2">#</th>
            <th>ทีม</th>
            <th className="text-center">แข่ง</th>
            <th className="text-center">ชนะ</th>
            <th className="text-center">เสมอ</th>
            <th className="text-center">แพ้</th>
            <th className="text-center">ได้-เสีย</th>
            <th className="text-center">แต้ม</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.teamId} className="border-b border-neutral-300">
              <td className="py-1 pr-2">{i + 1}</td>
              <td>{r.teamName}</td>
              <td className="text-center">{r.played}</td>
              <td className="text-center">{r.won}</td>
              <td className="text-center">{r.drawn}</td>
              <td className="text-center">{r.lost}</td>
              <td className="text-center">
                {r.goalsFor}-{r.goalsAgainst}
              </td>
              <td className="text-center font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="font-bold mb-2">ผลการแข่งขัน</h2>
      <table className="w-full border-collapse">
        <tbody>
          {matches.map((m) => (
            <tr key={m.id} className="border-b border-neutral-200">
              <td className="py-1 pr-3 text-neutral-500 w-14">นัด {m.round}</td>
              <td className="text-right pr-2">{m.homeTeam.name}</td>
              <td className="text-center font-bold w-14">
                {m.homeScore}-{m.awayScore}
              </td>
              <td className="pl-2">{m.awayTeam.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
