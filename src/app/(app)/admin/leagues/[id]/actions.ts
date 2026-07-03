"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { roundRobin } from "@/lib/schedule";

export async function generateSchedule(leagueId: string) {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: true },
  });

  const fixtures = roundRobin(
    league.teams.map((t) => t.id),
    league.legs
  );

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + ((7 - startDate.getDay()) % 7 || 7));
  startDate.setHours(9, 30, 0, 0);

  await prisma.$transaction([
    prisma.match.createMany({
      data: fixtures.map((f) => ({
        leagueId,
        round: f.round,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        kickoffAt: new Date(startDate.getTime() + (f.round - 1) * 7 * 86400000),
      })),
    }),
    prisma.league.update({ where: { id: leagueId }, data: { status: "SCHEDULED" } }),
  ]);

  revalidatePath(`/admin/leagues/${leagueId}`);
}
