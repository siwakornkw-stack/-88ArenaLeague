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

export async function deleteLeague(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  await prisma.league.delete({ where: { id: leagueId } });
  redirect("/dashboard");
}
