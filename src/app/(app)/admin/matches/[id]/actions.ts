"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { getSession } from "@/lib/session";

async function assertSuperAdmin() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
}

function getSide(formData: FormData) {
  const side = String(formData.get("side"));
  if (side !== "HOME" && side !== "AWAY") throw new Error("Invalid side");
  return side;
}

function getPlayerId(formData: FormData) {
  const playerId = formData.get("playerId");
  return playerId ? String(playerId) : null;
}

function getMinute(formData: FormData) {
  return Number(formData.get("minute")) || 0;
}

export async function kickOff(matchId: string) {
  await assertSuperAdmin();
  await prisma.$transaction([
    prisma.match.update({ where: { id: matchId }, data: { status: "LIVE" } }),
    prisma.matchEvent.create({
      data: { matchId, minute: 0, label: "เริ่มการแข่งขัน", type: "KICK_OFF", side: "NEUTRAL" },
    }),
  ]);
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function addGoal(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  const side = getSide(formData);
  const playerId = getPlayerId(formData);
  const minute = getMinute(formData);

  await prisma.$transaction([
    prisma.match.update({
      where: { id: matchId },
      data: side === "HOME" ? { homeScore: { increment: 1 } } : { awayScore: { increment: 1 } },
    }),
    prisma.matchEvent.create({
      data: { matchId, minute, label: "ประตู", type: "GOAL", side, playerId },
    }),
  ]);
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function addCard(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  const side = getSide(formData);
  const playerId = getPlayerId(formData);
  const minute = getMinute(formData);
  const cardType = String(formData.get("cardType")) === "RED" ? "RED_CARD" : "YELLOW_CARD";
  const label = cardType === "RED_CARD" ? "ใบแดง" : "ใบเหลือง";

  await prisma.matchEvent.create({
    data: { matchId, minute, label, type: cardType, side, playerId },
  });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function updateStats(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  const num = (key: string) => Number(formData.get(key)) || 0;

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homePossession: num("homePossession"),
      awayPossession: num("awayPossession"),
      homeShots: num("homeShots"),
      awayShots: num("awayShots"),
      homeShotsOnTarget: num("homeShotsOnTarget"),
      awayShotsOnTarget: num("awayShotsOnTarget"),
      homeCorners: num("homeCorners"),
      awayCorners: num("awayCorners"),
      homeFouls: num("homeFouls"),
      awayFouls: num("awayFouls"),
    },
  });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function updateVenue(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  const venue = String(formData.get("venue") ?? "").trim();
  await prisma.match.update({
    where: { id: matchId },
    data: { venue: venue || null },
  });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function endMatch(matchId: string) {
  await assertSuperAdmin();
  const kickoffEvent = await prisma.matchEvent.findFirst({
    where: { matchId, type: "KICK_OFF" },
  });
  const finalMinute = kickoffEvent ? computeLiveMinute(kickoffEvent.createdAt) : 0;

  await prisma.$transaction([
    prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED", minute: finalMinute } }),
    prisma.matchEvent.create({
      data: { matchId, minute: finalMinute, label: "จบการแข่งขัน", type: "FULL_TIME", side: "NEUTRAL" },
    }),
  ]);
  revalidatePath(`/admin/matches/${matchId}`);
}
