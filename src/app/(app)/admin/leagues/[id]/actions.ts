"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { roundRobin, buildKickoffDates } from "@/lib/schedule";
import { computeStandings } from "@/lib/standings";
import { getSession } from "@/lib/session";

export async function generateSchedule(leagueId: string, dayOfWeek: number) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: true },
  });

  const existing = await prisma.match.count({ where: { leagueId } });
  if (existing > 0) throw new Error("Schedule already exists");

  const fixtures = roundRobin(
    league.teams.map((t) => t.id),
    league.legs
  );
  const totalRounds = Math.max(...fixtures.map((f) => f.round));
  const kickoffDates = buildKickoffDates(totalRounds, dayOfWeek);

  await prisma.$transaction([
    prisma.match.createMany({
      data: fixtures.map((f) => ({
        leagueId,
        round: f.round,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        kickoffAt: kickoffDates[f.round - 1],
      })),
    }),
    prisma.league.update({ where: { id: leagueId }, data: { status: "SCHEDULED" } }),
  ]);

  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function finishSeason(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const [total, unfinished] = await Promise.all([
    prisma.match.count({ where: { leagueId } }),
    prisma.match.count({ where: { leagueId, status: { not: "FINISHED" } } }),
  ]);
  if (total === 0 || unfinished > 0) throw new Error("ยังมีแมตช์ที่ไม่จบการแข่งขัน");

  await prisma.league.update({ where: { id: leagueId }, data: { status: "FINISHED" } });
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function generatePlayoffs(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const matches = await prisma.match.findMany({ where: { leagueId } });
  const leagueStage = matches.filter((m) => m.stage === "LEAGUE");
  if (leagueStage.length === 0 || leagueStage.some((m) => m.status !== "FINISHED")) {
    throw new Error("ลีกยังแข่งไม่ครบทุกนัด");
  }
  if (matches.some((m) => m.stage !== "LEAGUE")) throw new Error("สร้างเพลย์ออฟแล้ว");

  const standings = await computeStandings(leagueId);
  if (standings.length < 4) throw new Error("ต้องมีอย่างน้อย 4 ทีม");

  const maxRound = Math.max(...leagueStage.map((m) => m.round));
  const semiDay = new Date();
  semiDay.setDate(semiDay.getDate() + 7);
  const semi1At = new Date(semiDay);
  semi1At.setHours(15, 0, 0, 0);
  const semi2At = new Date(semiDay);
  semi2At.setHours(17, 0, 0, 0);

  await prisma.match.createMany({
    data: [
      {
        leagueId,
        round: maxRound + 1,
        stage: "SEMI_FINAL",
        homeTeamId: standings[0].teamId,
        awayTeamId: standings[3].teamId,
        kickoffAt: semi1At,
      },
      {
        leagueId,
        round: maxRound + 1,
        stage: "SEMI_FINAL",
        homeTeamId: standings[1].teamId,
        awayTeamId: standings[2].teamId,
        kickoffAt: semi2At,
      },
    ],
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function generateFinal(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const semis = await prisma.match.findMany({
    where: { leagueId, stage: "SEMI_FINAL" },
    orderBy: { kickoffAt: "asc" },
  });
  if (semis.length !== 2 || semis.some((m) => m.status !== "FINISHED")) {
    throw new Error("รอบรองชนะเลิศยังไม่จบ");
  }
  const existingFinal = await prisma.match.count({ where: { leagueId, stage: "FINAL" } });
  if (existingFinal > 0) throw new Error("สร้างนัดชิงแล้ว");

  // knockout draws are settled by better league seed
  const standings = await computeStandings(leagueId);
  const seed = new Map(standings.map((r, i) => [r.teamId, i]));
  const winnerOf = (m: (typeof semis)[number]) =>
    m.homeScore > m.awayScore
      ? m.homeTeamId
      : m.awayScore > m.homeScore
        ? m.awayTeamId
        : (seed.get(m.homeTeamId) ?? 99) < (seed.get(m.awayTeamId) ?? 99)
          ? m.homeTeamId
          : m.awayTeamId;

  const finalAt = new Date();
  finalAt.setDate(finalAt.getDate() + 7);
  finalAt.setHours(17, 0, 0, 0);

  await prisma.match.create({
    data: {
      leagueId,
      round: semis[0].round + 1,
      stage: "FINAL",
      homeTeamId: winnerOf(semis[0]),
      awayTeamId: winnerOf(semis[1]),
      kickoffAt: finalAt,
    },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function updateLeague(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const seasonYear = Number(formData.get("seasonYear"));
  const description = String(formData.get("description") ?? "").trim();
  const clampZone = (key: string) => {
    const n = Math.round(Number(formData.get(key)) || 0);
    return Math.min(20, Math.max(0, n));
  };
  if (!name || !Number.isInteger(seasonYear)) return;

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      name,
      seasonYear,
      description: description || null,
      promotedCount: clampZone("promotedCount"),
      relegatedCount: clampZone("relegatedCount"),
    },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function duplicateLeague(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: { include: { players: true, managers: true } } },
  });

  const copy = await prisma.league.create({
    data: {
      name: league.name,
      seasonYear: league.seasonYear + 1,
      type: league.type,
      legs: league.legs,
      status: "DRAFT",
      teams: {
        create: league.teams.map((t) => ({
          name: t.name,
          abbr: t.abbr,
          color: t.color,
          managers: { connect: t.managers.map((m) => ({ id: m.id })) },
          players: {
            create: t.players.map((p) => ({
              name: p.name,
              number: p.number,
              position: p.position,
            })),
          },
        })),
      },
    },
  });

  redirect(`/admin/leagues/${copy.id}`);
}

export async function createNews(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;

  await prisma.leagueNews.create({ data: { leagueId, title, body } });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function deleteNews(leagueId: string, newsId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const news = await prisma.leagueNews.findUniqueOrThrow({ where: { id: newsId } });
  if (news.leagueId !== leagueId) throw new Error("Invalid news");

  await prisma.leagueNews.delete({ where: { id: newsId } });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function rescheduleRound(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const round = Number(formData.get("round"));
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  if (!Number.isInteger(round) || !date || !time) return;

  const kickoffAt = new Date(`${date}T${time}`);
  if (isNaN(kickoffAt.getTime())) return;

  await prisma.match.updateMany({
    where: { leagueId, round, status: "SCHEDULED" },
    data: { kickoffAt },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function deleteLeague(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  await prisma.league.delete({ where: { id: leagueId } });
  redirect("/dashboard");
}
