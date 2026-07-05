"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";

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

async function assertSuperAdmin() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function createTeam(leagueId: string, formData: FormData) {
  await assertSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const abbr = String(formData.get("abbr") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!name || !abbr) return;

  await prisma.team.create({
    data: { name, abbr, leagueId, ...(HEX_COLOR.test(color) ? { color } : {}) },
  });
  revalidatePath(`/admin/leagues/${leagueId}/teams`);
}

export async function updateTeam(teamId: string, formData: FormData) {
  await assertSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const abbr = String(formData.get("abbr") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!name || !abbr) return;

  const logoUrl = await maybeUploadLogo(teamId, formData);
  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      name,
      abbr,
      ...(HEX_COLOR.test(color) ? { color } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    },
  });
  revalidatePath(`/admin/leagues/${team.leagueId}/teams`);
}

export async function deleteTeam(teamId: string) {
  await assertSuperAdmin();

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    include: { _count: { select: { homeMatches: true, awayMatches: true } } },
  });
  if (team._count.homeMatches > 0 || team._count.awayMatches > 0) {
    throw new Error("ลบทีมไม่ได้ เนื่องจากมีตารางแข่งขันแล้ว");
  }

  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath(`/admin/leagues/${team.leagueId}/teams`);
}

export async function bulkCreateTeams(leagueId: string, formData: FormData) {
  await assertSuperAdmin();

  const raw = String(formData.get("bulk") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);

  const data = lines.map((line) => {
    const [name, abbr] = line.split(",").map((s) => s?.trim() ?? "");
    return {
      leagueId,
      name,
      abbr: (abbr || name.slice(0, 3)).toUpperCase().slice(0, 4),
    };
  }).filter((t) => t.name);

  if (data.length > 0) await prisma.team.createMany({ data });
  revalidatePath(`/admin/leagues/${leagueId}/teams`);
}

export async function transferPlayer(leagueId: string, formData: FormData) {
  await assertSuperAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  const toTeamId = String(formData.get("toTeamId") ?? "");
  if (!playerId || !toTeamId) return;

  const [player, target] = await Promise.all([
    prisma.player.findUniqueOrThrow({ where: { id: playerId }, include: { team: true } }),
    prisma.team.findUniqueOrThrow({ where: { id: toTeamId }, include: { players: true } }),
  ]);
  if (player.team.leagueId !== leagueId || target.leagueId !== leagueId) {
    throw new Error("Invalid transfer");
  }
  if (player.teamId === toTeamId) return;

  const usedNumbers = new Set(target.players.map((p) => p.number));
  let number = player.number;
  while (usedNumbers.has(number)) number++;

  await prisma.player.update({ where: { id: playerId }, data: { teamId: toTeamId, number } });
  revalidatePath(`/admin/leagues/${leagueId}/teams`);
}

export async function createTeamManager(teamId: string, formData: FormData) {
  await assertSuperAdmin();

  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !password) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("อีเมลนี้ถูกใช้แล้ว");

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "TEAM_MANAGER",
      managedTeams: { connect: { id: teamId } },
    },
  });
  revalidatePath(`/admin/leagues/${team.leagueId}/teams`);
}

export async function removeManager(teamId: string, userId: string) {
  await assertSuperAdmin();

  const team = await prisma.team.update({
    where: { id: teamId },
    data: { managers: { disconnect: { id: userId } } },
  });
  revalidatePath(`/admin/leagues/${team.leagueId}/teams`);
}
