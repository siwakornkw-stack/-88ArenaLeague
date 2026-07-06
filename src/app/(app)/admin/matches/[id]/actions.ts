"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { computeLiveMinute } from "@/lib/matchClock";
import { logAdmin } from "@/lib/audit";
import { getSession } from "@/lib/session";

async function assertSuperAdmin() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
  return session;
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
  const goalType = String(formData.get("goalType") ?? "NORMAL");
  const assistRaw = formData.get("assistPlayerId");
  const assistPlayerId = assistRaw ? String(assistRaw) : null;

  if (goalType === "PENALTY_MISSED") {
    await prisma.matchEvent.create({
      data: { matchId, minute, label: "จุดโทษพลาด", type: "PENALTY_MISSED", side, playerId },
    });
    revalidatePath(`/admin/matches/${matchId}`);
    return;
  }

  const isOwnGoal = goalType === "OWN_GOAL";
  // an own goal by `side`'s player scores for the opposite side
  const scoringSide = isOwnGoal ? (side === "HOME" ? "AWAY" : "HOME") : side;

  await prisma.$transaction([
    prisma.match.update({
      where: { id: matchId },
      data:
        scoringSide === "HOME" ? { homeScore: { increment: 1 } } : { awayScore: { increment: 1 } },
    }),
    prisma.matchEvent.create({
      data: {
        matchId,
        minute,
        label: isOwnGoal ? "ทำเข้าตัวเอง" : goalType === "PENALTY" ? "ประตู (จุดโทษ)" : "ประตู",
        type: isOwnGoal ? "OWN_GOAL" : "GOAL",
        side,
        playerId,
        relatedPlayerId:
          !isOwnGoal && assistPlayerId && assistPlayerId !== playerId ? assistPlayerId : null,
      },
    }),
  ]);
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function addSubstitution(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

  const side = getSide(formData);
  const minute = getMinute(formData);
  const playerInId = String(formData.get("playerInId") ?? "");
  const playerOutId = String(formData.get("playerOutId") ?? "");
  if (!playerInId || !playerOutId || playerInId === playerOutId) {
    throw new Error("Invalid substitution");
  }

  const [playerIn, playerOut] = await Promise.all([
    prisma.player.findUniqueOrThrow({ where: { id: playerInId } }),
    prisma.player.findUniqueOrThrow({ where: { id: playerOutId } }),
  ]);

  await prisma.$transaction([
    prisma.matchEvent.create({
      data: {
        matchId,
        minute,
        label: `เปลี่ยนตัว: ${playerIn.name} เข้า แทน ${playerOut.name}`,
        type: "SUBSTITUTION",
        side,
        playerId: playerInId,
        relatedPlayerId: playerOutId,
      },
    }),
    prisma.matchLineup.upsert({
      where: { matchId_playerId: { matchId, playerId: playerInId } },
      update: {},
      create: { matchId, playerId: playerInId, isStarting: false },
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

  const createEvent = prisma.matchEvent.create({
    data: { matchId, minute, label, type: cardType, side, playerId },
  });
  // a red card automatically suspends the player; the manager clears it manually
  if (cardType === "RED_CARD" && playerId) {
    await prisma.$transaction([
      createEvent,
      prisma.player.update({ where: { id: playerId }, data: { status: "BANNED" } }),
    ]);
  } else {
    await createEvent;
  }
  revalidatePath(`/admin/matches/${matchId}`);
}

const QUICK_STAT_DATA: Record<string, Record<string, { increment: number }>> = {
  "HOME:Shots": { homeShots: { increment: 1 } },
  "AWAY:Shots": { awayShots: { increment: 1 } },
  "HOME:Corners": { homeCorners: { increment: 1 } },
  "AWAY:Corners": { awayCorners: { increment: 1 } },
  "HOME:Fouls": { homeFouls: { increment: 1 } },
  "AWAY:Fouls": { awayFouls: { increment: 1 } },
};

export async function quickStat(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

  const side = getSide(formData);
  const stat = String(formData.get("stat"));
  const data = QUICK_STAT_DATA[`${side}:${stat}`];
  if (!data) throw new Error("Invalid stat");

  await prisma.match.update({ where: { id: matchId }, data });
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

export async function halfTime(matchId: string, formData?: FormData) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

  const existing = await prisma.matchEvent.findFirst({ where: { matchId, type: "HALF_TIME" } });
  if (existing) throw new Error("Half time already recorded");

  const [match, kickoffEvent] = await Promise.all([
    prisma.match.findUniqueOrThrow({ where: { id: matchId } }),
    prisma.matchEvent.findFirst({ where: { matchId, type: "KICK_OFF" } }),
  ]);
  const fixed45 = formData?.get("fixed45") === "1";
  const minute = fixed45 ? 45 : kickoffEvent ? computeLiveMinute(kickoffEvent.createdAt) : 0;

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

const DELETABLE_EVENT_TYPES = [
  "GOAL",
  "OWN_GOAL",
  "PENALTY_MISSED",
  "YELLOW_CARD",
  "RED_CARD",
  "SUBSTITUTION",
  "INJURY",
];

export async function recordInjury(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

  const side = getSide(formData);
  const playerId = getPlayerId(formData);
  const minute = getMinute(formData);

  await prisma.matchEvent.create({
    data: { matchId, minute, label: "บาดเจ็บ", type: "INJURY", side, playerId },
  });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function deleteEvent(matchId: string, formData: FormData) {
  await assertSuperAdmin();

  const eventId = String(formData.get("eventId") ?? "");
  const event = await prisma.matchEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (event.matchId !== matchId) throw new Error("Invalid event");
  if (!DELETABLE_EVENT_TYPES.includes(event.type)) throw new Error("Cannot delete this event");

  const isScoring = event.type === "GOAL" || event.type === "OWN_GOAL";
  if (isScoring && (event.side === "HOME" || event.side === "AWAY")) {
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    // OWN_GOAL benefited the opposite side of the event's team
    const benefitedHome =
      event.type === "GOAL" ? event.side === "HOME" : event.side === "AWAY";
    const data = benefitedHome
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

export async function updateEventMinute(matchId: string, formData: FormData) {
  await assertSuperAdmin();

  const eventId = String(formData.get("eventId") ?? "");
  const minute = getMinute(formData);
  const event = await prisma.matchEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (event.matchId !== matchId) throw new Error("Invalid event");
  if (!DELETABLE_EVENT_TYPES.includes(event.type)) throw new Error("Cannot edit this event");

  await prisma.matchEvent.update({ where: { id: eventId }, data: { minute } });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function updateMatchInfo(matchId: string, formData: FormData) {
  await assertSuperAdmin();

  const venue = String(formData.get("venue") ?? "").trim();
  const kickoffRaw = String(formData.get("kickoffAt") ?? "").trim();
  const streamRaw = String(formData.get("streamUrl") ?? "").trim();
  const spectatorsRaw = String(formData.get("spectators") ?? "").trim();
  const refereeName = String(formData.get("refereeName") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  const data: {
    venue: string | null;
    kickoffAt?: Date;
    streamUrl: string | null;
    spectators: number | null;
    refereeName: string | null;
    note: string | null;
  } = {
    venue: venue || null,
    streamUrl: /^https?:\/\//.test(streamRaw) ? streamRaw : null,
    spectators: spectatorsRaw ? Math.max(0, Math.round(Number(spectatorsRaw) || 0)) : null,
    refereeName: refereeName || null,
    note: note || null,
  };

  if (kickoffRaw && match.status === "SCHEDULED") {
    const kickoffAt = new Date(kickoffRaw);
    if (!isNaN(kickoffAt.getTime())) data.kickoffAt = kickoffAt;
  }

  await prisma.match.update({ where: { id: matchId }, data });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function resetEvents(matchId: string) {
  const session = await assertSuperAdmin();
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });
  if (match.status === "FINISHED") throw new Error("Reopen the match first");

  await prisma.$transaction([
    prisma.matchEvent.deleteMany({ where: { matchId, type: { not: "KICK_OFF" } } }),
    prisma.match.update({ where: { id: matchId }, data: { homeScore: 0, awayScore: 0 } }),
  ]);
  await logAdmin(
    session,
    "รีเซ็ตเหตุการณ์",
    `${match.homeTeam.name} vs ${match.awayTeam.name} · #${matchId}`,
    match.leagueId
  );
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function swapSides(matchId: string) {
  await assertSuperAdmin();
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  if (match.status !== "SCHEDULED") throw new Error("Swap allowed only before kickoff");

  await prisma.match.update({
    where: { id: matchId },
    data: { homeTeamId: match.awayTeamId, awayTeamId: match.homeTeamId },
  });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function reopenMatch(matchId: string) {
  const session = await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "FINISHED") throw new Error("Match is not finished");

  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });
  await prisma.$transaction([
    prisma.matchEvent.deleteMany({ where: { matchId, type: "FULL_TIME" } }),
    // Re-anchor the live clock: computeLiveMinute derives the minute from the
    // KICK_OFF event's createdAt, so a stale timestamp would read a capped 130'.
    prisma.matchEvent.updateMany({
      where: { matchId, type: "KICK_OFF" },
      data: { createdAt: new Date() },
    }),
    prisma.match.update({ where: { id: matchId }, data: { status: "LIVE", minute: 0 } }),
  ]);
  await logAdmin(session, "เปิดแมตช์ใหม่", `${match.homeTeam.name} vs ${match.awayTeam.name}`);
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function updateMvp(matchId: string, formData: FormData) {
  await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "FINISHED") throw new Error("Match is not finished");

  const raw = formData.get("mvpPlayerId");
  const mvpPlayerId = raw ? String(raw) : null;

  await prisma.match.update({ where: { id: matchId }, data: { mvpPlayerId } });
  revalidatePath(`/admin/matches/${matchId}`);
}

export async function endMatch(matchId: string) {
  const session = await assertSuperAdmin();
  if ((await getMatchStatus(matchId)) !== "LIVE") throw new Error("Match is not live");

  const kickoffEvent = await prisma.matchEvent.findFirst({
    where: { matchId, type: "KICK_OFF" },
  });
  const finalMinute = kickoffEvent ? computeLiveMinute(kickoffEvent.createdAt) : 0;

  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });
  await prisma.$transaction([
    prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED", minute: finalMinute } }),
    prisma.matchEvent.create({
      data: { matchId, minute: finalMinute, label: "จบการแข่งขัน", type: "FULL_TIME", side: "NEUTRAL" },
    }),
  ]);
  await logAdmin(
    session,
    "จบการแข่งขัน",
    `${match.homeTeam.name} ${match.homeScore}-${match.awayScore} ${match.awayTeam.name} · #${matchId}`,
    match.leagueId
  );
  revalidatePath(`/admin/matches/${matchId}`);
}
