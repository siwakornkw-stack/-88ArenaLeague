import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { roundRobin, buildKickoffDates } from "@/lib/schedule";
import { generateSchedule } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "จัดตารางแล้ว",
  IN_PROGRESS: "กำลังแข่งขัน",
  FINISHED: "จบฤดูกาล",
};

const DAY_LABELS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const FORM_LABEL: Record<"W" | "D" | "L", { t: string; className: string }> = {
  W: { t: "ช", className: "bg-accent text-black" },
  D: { t: "ส", className: "bg-white/15 text-foreground" },
  L: { t: "พ", className: "bg-red-500 text-white" },
};

export default async function LeagueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; day?: string }>;
}) {
  const { id } = await params;
  const { tab = "fixtures", day } = await searchParams;
  const dayOfWeek = day !== undefined ? Number(day) || 0 : null;

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
  const generateWithId = generateSchedule.bind(null, id, dayOfWeek ?? 0);

  let previewByRound: Map<number, { homeName: string; awayName: string }[]> | null = null;
  let previewDates: Date[] = [];
  if (matches.length === 0 && dayOfWeek !== null && league.teams.length >= 2) {
    const teamNameById = new Map(league.teams.map((t) => [t.id, t.name]));
    const fixtures = roundRobin(league.teams.map((t) => t.id), league.legs);
    const totalRounds = Math.max(...fixtures.map((f) => f.round));
    previewDates = buildKickoffDates(totalRounds, dayOfWeek);
    previewByRound = new Map();
    for (const f of fixtures) {
      if (!previewByRound.has(f.round)) previewByRound.set(f.round, []);
      previewByRound.get(f.round)!.push({
        homeName: teamNameById.get(f.homeTeamId) ?? "-",
        awayName: teamNameById.get(f.awayTeamId) ?? "-",
      });
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl">{league.name}</h1>
          <p className="text-foreground/60 mt-1">
            ฤดูกาล {league.seasonYear} · {league.teams.length} ทีม ·{" "}
            {STATUS_LABEL[league.status]}
          </p>
        </div>
        <Link
          href={`/admin/leagues/${id}/teams`}
          className="rounded-md border border-white/15 px-4 py-2 text-sm text-foreground/80 hover:border-accent/50 hover:text-accent"
        >
          จัดการทีม
        </Link>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg bg-card border border-white/10 p-6 max-w-md space-y-5">
          {league.teams.length < 2 ? (
            <p className="text-sm text-foreground/70">
              ต้องมีอย่างน้อย 2 ทีมก่อนสร้างตารางแข่งขัน{" "}
              <Link href={`/admin/leagues/${id}/teams`} className="text-accent hover:underline">
                เพิ่มทีม
              </Link>
            </p>
          ) : (
            <>
              <p className="text-sm text-foreground/70">
                สร้างตารางแบบพบกันหมดจากทีมทั้งหมด {league.teams.length} ทีม
              </p>

              <form method="get" className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-sm text-foreground/70" htmlFor="day">
                    วันแข่งขันประจำสัปดาห์
                  </label>
                  <select
                    id="day"
                    name="day"
                    defaultValue={dayOfWeek ?? 0}
                    className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    {DAY_LABELS.map((label, value) => (
                      <option key={value} value={value}>
                        วัน{label}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
                  แสดงตัวอย่าง
                </button>
              </form>

              {previewByRound && (
                <div className="space-y-4">
                  <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
                    {Array.from(previewByRound.entries()).map(([round, roundFixtures]) => (
                      <div key={round}>
                        <h3 className="text-sm text-foreground/50 mb-2">
                          นัดที่ {round} · {previewDates[round - 1]?.toLocaleDateString("th-TH")}
                        </h3>
                        <div className="space-y-1">
                          {roundFixtures.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm"
                            >
                              <span>{f.homeName}</span>
                              <span className="text-foreground/40">vs</span>
                              <span>{f.awayName}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <form action={generateWithId}>
                    <button
                      type="submit"
                      className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm"
                    >
                      ยืนยันและเผยแพร่ตาราง
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
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
