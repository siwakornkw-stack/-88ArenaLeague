"use server";

import { revalidatePath } from "next/cache";
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
