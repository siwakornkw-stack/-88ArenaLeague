"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { uploadImage } from "@/lib/blobUpload";
import { LINEUP_SIZE } from "@/lib/constants";

const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function maybeUploadLogo(teamId: string, formData: FormData): Promise<string | null> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!LOGO_TYPES.has(file.type)) throw new Error("โลโก้รองรับเฉพาะ PNG/JPEG/WebP");
  if (file.size > MAX_LOGO_BYTES) throw new Error("ไฟล์โลโก้ต้องไม่เกิน 1MB");
  const blob = await put(`team-logos/${teamId}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return blob.url;
}

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

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function updateMyTeam(teamId: string, formData: FormData) {
  await assertManagesTeam(teamId);

  const name = String(formData.get("name") ?? "").trim();
  const abbr = String(formData.get("abbr") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!name || !abbr) return;

  // Only touch coachName/homeVenue/foundedYear when the submitting form actually
  // includes them — otherwise a name/color/logo edit would null out fields it
  // never rendered.
  const optional: {
    coachName?: string | null;
    homeVenue?: string | null;
    foundedYear?: number | null;
  } = {};
  if (formData.has("coachName")) {
    optional.coachName = String(formData.get("coachName") ?? "").trim() || null;
  }
  if (formData.has("homeVenue")) {
    optional.homeVenue = String(formData.get("homeVenue") ?? "").trim() || null;
  }
  if (formData.has("foundedYear")) {
    const y = Number(formData.get("foundedYear"));
    optional.foundedYear = Number.isInteger(y) && y > 1900 ? y : null;
  }

  const logoUrl = await maybeUploadLogo(teamId, formData);
  await prisma.team.update({
    where: { id: teamId },
    data: {
      name,
      abbr,
      ...optional,
      ...(HEX_COLOR.test(color) ? { color } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    },
  });
  revalidatePath("/teams/mine");
}

export async function importPlayers(teamId: string, formData: FormData) {
  await assertManagesTeam(teamId);

  const raw = String(formData.get("bulk") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const existing = await prisma.player.findMany({ where: { teamId }, select: { number: true } });
  const used = new Set(existing.map((p) => p.number));

  const data: { teamId: string; name: string; number: number; position: string }[] = [];
  let skipped = 0;
  for (const line of lines) {
    const [name, numberRaw, position] = line.split(",").map((s) => s?.trim() ?? "");
    const number = Number(numberRaw);
    if (!name || !position || !Number.isInteger(number) || number <= 0 || used.has(number)) {
      skipped++;
      continue;
    }
    used.add(number);
    data.push({ teamId, name, number, position });
  }

  if (data.length > 0) await prisma.player.createMany({ data });
  revalidatePath("/teams/mine");
  redirect(`/teams/mine?imported=${data.length}&skipped=${skipped}`);
}

export async function addPlayer(teamId: string, formData: FormData) {
  await assertManagesTeam(teamId);

  const name = String(formData.get("name") ?? "").trim();
  const number = Number(formData.get("number"));
  const position = String(formData.get("position") ?? "").trim();
  if (!name || !position || !Number.isInteger(number)) throw new Error("Invalid player data");

  const duplicate = await prisma.player.findFirst({ where: { teamId, number } });
  if (duplicate) throw new Error("มีนักเตะเบอร์นี้อยู่แล้ว");

  const nickname = String(formData.get("nickname") ?? "").trim();
  const birthYearRaw = Number(formData.get("birthYear"));
  const heightRaw = Number(formData.get("heightCm"));
  const weightRaw = Number(formData.get("weightKg"));
  const photoUrl = await uploadImage(`player-photos/${teamId}`, formData.get("photo"));
  await prisma.player.create({
    data: {
      teamId,
      name,
      number,
      position,
      nickname: nickname || null,
      birthYear: Number.isInteger(birthYearRaw) && birthYearRaw > 1900 ? birthYearRaw : null,
      heightCm: Number.isInteger(heightRaw) && heightRaw > 100 ? heightRaw : null,
      weightKg: Number.isInteger(weightRaw) && weightRaw > 30 ? weightRaw : null,
      ...(photoUrl ? { photoUrl } : {}),
    },
  });
  revalidatePath("/teams/mine");
}

export async function updatePlayerInfo(playerId: string, formData: FormData) {
  const player = await assertManagesPlayer(playerId);

  const name = String(formData.get("name") ?? "").trim();
  const number = Number(formData.get("number"));
  const position = String(formData.get("position") ?? "").trim();
  if (!name || !position || !Number.isInteger(number) || number <= 0) {
    throw new Error("Invalid player data");
  }

  if (number !== player.number) {
    const duplicate = await prisma.player.findFirst({
      where: { teamId: player.teamId, number, id: { not: playerId } },
    });
    if (duplicate) throw new Error("มีนักเตะเบอร์นี้อยู่แล้ว");
  }

  const photoUrl = await uploadImage(`player-photos/${player.teamId}`, formData.get("photo"));
  await prisma.player.update({
    where: { id: playerId },
    data: { name, number, position, ...(photoUrl ? { photoUrl } : {}) },
  });
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

  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  if (match.status !== "SCHEDULED" || match.kickoffAt.getTime() <= Date.now()) {
    throw new Error("หมดเวลาส่งรายชื่อ แมตช์เริ่มแข่งแล้ว");
  }

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
      data: playerIds.map((playerId) => {
        const shirtRaw = Number(formData.get(`shirt_${playerId}`));
        return {
          matchId,
          playerId,
          isStarting: true,
          shirtNumber: Number.isInteger(shirtRaw) && shirtRaw > 0 ? shirtRaw : null,
        };
      }),
    }),
  ]);
  revalidatePath("/teams/mine");
}

export async function clearLineup(matchId: string) {
  const teamId = await getManagedTeamIdForMatch(matchId);

  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  if (match.status !== "SCHEDULED" || match.kickoffAt.getTime() <= Date.now()) {
    throw new Error("หมดเวลาแก้รายชื่อ แมตช์เริ่มแข่งแล้ว");
  }

  await prisma.matchLineup.deleteMany({ where: { matchId, player: { teamId } } });
  revalidatePath("/teams/mine");
}

// copy the lineup from this team's most recent finished match
export async function copyLastLineup(matchId: string) {
  const teamId = await getManagedTeamIdForMatch(matchId);

  const lastMatch = await prisma.match.findFirst({
    where: {
      status: "FINISHED",
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { kickoffAt: "desc" },
    include: { lineups: { where: { player: { teamId } } } },
  });
  if (!lastMatch || lastMatch.lineups.length === 0) {
    throw new Error("ไม่พบรายชื่อจากนัดก่อนหน้า");
  }

  const activeIds = new Set(
    (
      await prisma.player.findMany({ where: { teamId, status: "ACTIVE" }, select: { id: true } })
    ).map((p) => p.id)
  );
  const rows = lastMatch.lineups
    .filter((l) => activeIds.has(l.playerId))
    .slice(0, LINEUP_SIZE);

  await prisma.$transaction([
    prisma.matchLineup.deleteMany({ where: { matchId, player: { teamId } } }),
    prisma.matchLineup.createMany({
      data: rows.map((l) => ({
        matchId,
        playerId: l.playerId,
        isStarting: l.isStarting,
        shirtNumber: l.shirtNumber,
      })),
    }),
  ]);
  revalidatePath("/teams/mine");
}
