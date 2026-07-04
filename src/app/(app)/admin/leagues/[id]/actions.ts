"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { roundRobin, buildKickoffDates } from "@/lib/schedule";
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

export async function updateLeague(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const seasonYear = Number(formData.get("seasonYear"));
  if (!name || !Number.isInteger(seasonYear)) return;

  await prisma.league.update({ where: { id: leagueId }, data: { name, seasonYear } });
  revalidatePath(`/admin/leagues/${leagueId}`);
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
