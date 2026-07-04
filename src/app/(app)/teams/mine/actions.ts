"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { LINEUP_SIZE } from "@/lib/constants";

async function assertManagesTeam(teamId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const team = await prisma.team.findFirst({
    where: { id: teamId, managers: { some: { id: session.userId } } },
  });
  if (!team) throw new Error("Unauthorized");
}

async function assertManagesPlayer(playerId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const player = await prisma.player.findFirst({
    where: { id: playerId, team: { managers: { some: { id: session.userId } } } },
  });
  if (!player) throw new Error("Unauthorized");
  return player;
}

async function getManagedTeamIdForMatch(matchId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });

  const managedHome = await prisma.team.findFirst({
    where: { id: match.homeTeamId, managers: { some: { id: session.userId } } },
  });
  if (managedHome) return managedHome.id;

  const managedAway = await prisma.team.findFirst({
    where: { id: match.awayTeamId, managers: { some: { id: session.userId } } },
  });
  if (managedAway) return managedAway.id;

  throw new Error("Unauthorized");
}

export async function addPlayer(teamId: string, formData: FormData) {
  await assertManagesTeam(teamId);

  const name = String(formData.get("name") ?? "").trim();
  const number = Number(formData.get("number"));
  const position = String(formData.get("position") ?? "").trim();
  if (!name || !position || !Number.isInteger(number)) throw new Error("Invalid player data");

  const duplicate = await prisma.player.findFirst({ where: { teamId, number } });
  if (duplicate) throw new Error("มีนักเตะเบอร์นี้อยู่แล้ว");

  await prisma.player.create({ data: { teamId, name, number, position } });
  revalidatePath("/teams/mine");
}

export async function updatePlayerStatus(playerId: string, formData: FormData) {
  await assertManagesPlayer(playerId);

  const status = String(formData.get("status"));
  if (status !== "ACTIVE" && status !== "INJURED" && status !== "BANNED") {
    throw new Error("Invalid status");
  }

  await prisma.player.update({ where: { id: playerId }, data: { status } });
  revalidatePath("/teams/mine");
}

export async function deletePlayer(playerId: string) {
  await assertManagesPlayer(playerId);

  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    include: { _count: { select: { events: true, lineups: true } } },
  });
  if (player._count.events > 0 || player._count.lineups > 0) {
    throw new Error("ลบนักเตะไม่ได้ เนื่องจากมีสถิติในแมตช์แล้ว");
  }

  await prisma.player.delete({ where: { id: playerId } });
  revalidatePath("/teams/mine");
}

export async function setLineup(matchId: string, formData: FormData) {
  const teamId = await getManagedTeamIdForMatch(matchId);

  const submittedIds = formData.getAll("playerId").map(String);
  const ownPlayers = await prisma.player.findMany({
    where: { teamId, status: "ACTIVE" },
    select: { id: true },
  });
  const ownPlayerIds = new Set(ownPlayers.map((p) => p.id));
  const playerIds = submittedIds.filter((id) => ownPlayerIds.has(id)).slice(0, LINEUP_SIZE);

  await prisma.$transaction([
    prisma.matchLineup.deleteMany({ where: { matchId, player: { teamId } } }),
    prisma.matchLineup.createMany({
      data: playerIds.map((playerId) => ({ matchId, playerId, isStarting: true })),
    }),
  ]);
  revalidatePath("/teams/mine");
}
