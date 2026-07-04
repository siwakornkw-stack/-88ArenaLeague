import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";
import { roundRobin, buildKickoffDates } from "@/lib/schedule";
import {
  generateSchedule,
  finishSeason,
  updateLeague,
  deleteLeague,
  duplicateLeague,
  createNews,
  deleteNews,
  rescheduleRound,
} from "./actions";

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
  searchParams: Promise<{ tab?: string; day?: string; round?: string; delete?: string }>;
}) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const { id } = await params;
  const { tab = "fixtures", day, round, delete: confirmDelete } = await searchParams;
  const dayOfWeek = day !== undefined ? Number(day) || 0 : null;
  const roundFilter = Number(round) || null;

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: true, news: { orderBy: { createdAt: "desc" } } },
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
        <div className="flex items-center gap-3">
          {league.status !== "FINISHED" &&
            matches.length > 0 &&
            matches.every((m) => m.status === "FINISHED") && (
              <form action={finishSeason.bind(null, id)}>
                <button
                  type="submit"
                  className="rounded-md bg-accent text-black font-semibold px-4 py-2 text-sm"
                >
                  🏁 ปิดฤดูกาล
                </button>
              </form>
            )}
          <Link
            href={`/admin/leagues/${id}/teams`}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-foreground/80 hover:border-accent/50 hover:text-accent"
          >
            จัดการทีม
          </Link>
        </div>
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
              <form method="get" className="flex items-center gap-2">
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
                <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
                  ดู
                </button>
              </form>
              {Array.from(matchesByRound.entries())
                .filter(([r]) => roundFilter === null || r === roundFilter)
                .map(([round, roundMatches]) => (
                <div key={round}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm text-foreground/50">นัดที่ {round}</h3>
                    {roundMatches.some((m) => m.status === "SCHEDULED") && (
                      <form action={rescheduleRound.bind(null, id)} className="flex items-center gap-1">
                        <input type="hidden" name="round" value={round} />
                        <input
                          type="date"
                          name="date"
                          required
                          className="rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs"
                        />
                        <input
                          type="time"
                          name="time"
                          required
                          className="rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs"
                        />
                        <button type="submit" className="rounded-md bg-white/10 px-3 py-1 text-xs">
                          ตั้งทั้งนัด
                        </button>
                      </form>
                    )}
                  </div>
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

      <div className="rounded-lg bg-card border border-white/10 p-5 space-y-4">
        <h2 className="font-semibold">ข่าวสารลีก</h2>
        <form action={createNews.bind(null, id)} className="space-y-2 max-w-md">
          <input
            name="title"
            required
            placeholder="หัวข้อประกาศ"
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="เนื้อหา"
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-md bg-accent text-black font-semibold px-4 py-2 text-sm"
          >
            โพสต์ประกาศ
          </button>
        </form>
        <div className="space-y-2">
          {league.news.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 rounded-md bg-white/5 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-semibold">{n.title}</div>
                <div className="text-xs text-foreground/50">
                  {n.createdAt.toLocaleDateString("th-TH", { dateStyle: "medium" })}
                </div>
              </div>
              <form action={deleteNews.bind(null, id, n.id)}>
                <button type="submit" className="text-xs text-foreground/50 hover:text-red-400">
                  ลบ
                </button>
              </form>
            </div>
          ))}
          {league.news.length === 0 && (
            <p className="text-foreground/50 text-sm">ยังไม่มีประกาศ</p>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-card border border-white/10 p-5 max-w-sm space-y-4">
        <h2 className="font-semibold">ตั้งค่าลีก</h2>
        <form action={updateLeague.bind(null, id)} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="league-name">
              ชื่อลีก
            </label>
            <input
              id="league-name"
              name="name"
              required
              defaultValue={league.name}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="league-season">
              ฤดูกาล (ปี)
            </label>
            <input
              id="league-season"
              name="seasonYear"
              type="number"
              required
              defaultValue={league.seasonYear}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="league-description">
              คำอธิบาย/กติกาลีก (โชว์หน้าสาธารณะ)
            </label>
            <textarea
              id="league-description"
              name="description"
              rows={3}
              defaultValue={league.description ?? ""}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="league-promoted">
                โซนเข้ารอบ (ทีม)
              </label>
              <input
                id="league-promoted"
                name="promotedCount"
                type="number"
                min={0}
                defaultValue={league.promotedCount}
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm text-foreground/70" htmlFor="league-relegated">
                โซนตกชั้น (ทีม)
              </label>
              <input
                id="league-relegated"
                name="relegatedCount"
                type="number"
                min={0}
                defaultValue={league.relegatedCount}
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-accent text-black font-semibold px-4 py-2 text-sm"
          >
            บันทึก
          </button>
        </form>

        <div className="border-t border-white/10 pt-4">
          <form action={duplicateLeague.bind(null, id)}>
            <button type="submit" className="text-sm text-foreground/70 hover:text-accent">
              📋 คัดลอกไปฤดูกาล {league.seasonYear + 1} (ทีม + นักเตะ)
            </button>
          </form>
        </div>

        <div className="border-t border-white/10 pt-4">
          {confirmDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-red-400">
                ลบลีกนี้ถาวร? ทีม นักเตะ แมตช์ และสถิติทั้งหมดจะถูกลบไปด้วย
              </p>
              <div className="flex gap-2">
                <form action={deleteLeague.bind(null, id)}>
                  <button
                    type="submit"
                    className="rounded-md bg-red-500 text-white font-semibold px-4 py-2 text-sm"
                  >
                    ยืนยันลบถาวร
                  </button>
                </form>
                <Link
                  href={`/admin/leagues/${id}`}
                  className="rounded-md bg-white/10 px-4 py-2 text-sm"
                >
                  ยกเลิก
                </Link>
              </div>
            </div>
          ) : (
            <Link
              href={`/admin/leagues/${id}?delete=1`}
              className="text-sm text-red-400 hover:underline"
            >
              ลบลีกนี้
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
