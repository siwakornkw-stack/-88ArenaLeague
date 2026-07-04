"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { getSession } from "@/lib/session";

async function assertSuperAdmin() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
}

async function getMatchStatus(matchId: string) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { status: true },
  });
  return match.status;
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
  const minute = Number(formData.get("minute")) || 0;
  return Math.min(130, Math.max(0, Math.round(minute)));
}

export async function kickOff(matchId: string) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "SCHEDULED") throw new Error("Match already started");

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
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

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
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

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
  if ((await getMatchStatus(matchId)) === "SCHEDULED") throw new Error("Match has not started");

  const clamp = (key: string, max: number) => {
    const n = Math.round(Number(formData.get(key)) || 0);
    return Math.min(max, Math.max(0, n));
  };

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homePossession: clamp("homePossession", 100),
      awayPossession: clamp("awayPossession", 100),
      homeShots: clamp("homeShots", 999),
      awayShots: clamp("awayShots", 999),
      homeShotsOnTarget: clamp("homeShotsOnTarget", 999),
      awayShotsOnTarget: clamp("awayShotsOnTarget", 999),
      homeCorners: clamp("homeCorners", 999),
      awayCorners: clamp("awayCorners", 999),
      homeFouls: clamp("homeFouls", 999),
      awayFouls: clamp("awayFouls", 999),
    },
  });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function halfTime(matchId: string) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

  const existing = await prisma.matchEvent.findFirst({ where: { matchId, type: "HALF_TIME" } });
  if (existing) throw new Error("Half time already recorded");

  const [match, kickoffEvent] = await Promise.all([
    prisma.match.findUniqueOrThrow({ where: { id: matchId } }),
    prisma.matchEvent.findFirst({ where: { matchId, type: "KICK_OFF" } }),
  ]);
  const minute = kickoffEvent ? computeLiveMinute(kickoffEvent.createdAt) : 0;

  await prisma.matchEvent.create({
    data: {
      matchId,
      minute,
      label: `พักครึ่ง ${match.homeScore}-${match.awayScore}`,
      type: "HALF_TIME",
      side: "NEUTRAL",
    },
  });
  revalidatePath(`/admin/matches/${matchId}`);
}

const DELETABLE_EVENT_TYPES = ["GOAL", "YELLOW_CARD", "RED_CARD"];

export async function deleteEvent(matchId: string, formData: FormData) {
  await assertSuperAdmin();

  const eventId = String(formData.get("eventId") ?? "");
  const event = await prisma.matchEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (event.matchId !== matchId) throw new Error("Invalid event");
  if (!DELETABLE_EVENT_TYPES.includes(event.type)) throw new Error("Cannot delete this event");

  if (event.type === "GOAL" && (event.side === "HOME" || event.side === "AWAY")) {
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    const data =
      event.side === "HOME"
        ? { homeScore: Math.max(0, match.homeScore - 1) }
        : { awayScore: Math.max(0, match.awayScore - 1) };
    await prisma.$transaction([
      prisma.matchEvent.delete({ where: { id: eventId } }),
      prisma.match.update({ where: { id: matchId }, data }),
    ]);
  } else {
    await prisma.matchEvent.delete({ where: { id: eventId } });
  }
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function updateMatchInfo(matchId: string, formData: FormData) {
  await assertSuperAdmin();

  const venue = String(formData.get("venue") ?? "").trim();
  const kickoffRaw = String(formData.get("kickoffAt") ?? "").trim();

  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  const data: { venue: string | null; kickoffAt?: Date } = { venue: venue || null };

  if (kickoffRaw && match.status === "SCHEDULED") {
    const kickoffAt = new Date(kickoffRaw);
    if (!isNaN(kickoffAt.getTime())) data.kickoffAt = kickoffAt;
  }

  await prisma.match.update({ where: { id: matchId }, data });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function endMatch(matchId: string) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

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
