"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";

async function assertSuperAdmin() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
}

export async function createTeam(leagueId: string, formData: FormData) {
  await assertSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const abbr = String(formData.get("abbr") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!name || !abbr) return;

  await prisma.team.create({
    data: { name, abbr, leagueId, ...(color ? { color } : {}) },
  });
  revalidatePath(`/admin/leagues/${leagueId}/teams`);
}

export async function updateTeam(teamId: string, formData: FormData) {
  await assertSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const abbr = String(formData.get("abbr") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  if (!name || !abbr) return;

  const team = await prisma.team.update({
    where: { id: teamId },
    data: { name, abbr, color },
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

export async function createTeamManager(teamId: string, formData: FormData) {
  await assertSuperAdmin();

  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !password) return;

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
