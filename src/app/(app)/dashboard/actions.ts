"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { logAdmin } from "@/lib/audit";

export async function createAdmin(formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || password.length < 8) {
    throw new Error("ข้อมูลไม่ครบ หรือรหัสผ่านสั้นกว่า 8 ตัวอักษร");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("อีเมลนี้ถูกใช้แล้ว");

  await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: "SUPER_ADMIN" },
  });
  await logAdmin(session, "สร้างแอดมิน", email);
  revalidatePath("/dashboard");
}

export async function resetUserPassword(userId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) throw new Error("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
  await logAdmin(session, "รีเซ็ตรหัสผ่าน", user.email);
  revalidatePath("/dashboard");
}

export async function setUserActive(userId: string, active: boolean) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
  if (userId === session.userId) throw new Error("ปิดบัญชีตัวเองไม่ได้");

  const user = await prisma.user.update({ where: { id: userId }, data: { isActive: active } });
  await logAdmin(session, active ? "เปิดใช้บัญชี" : "ระงับบัญชี", user.email);
  revalidatePath("/dashboard");
}

export async function createLeague(formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const seasonYear = Number(formData.get("seasonYear"));
  const legs = Number(formData.get("legs"));

  if (!name || !seasonYear) return;

  await prisma.league.create({
    data: {
      name,
      seasonYear,
      type: "round_robin",
      legs: legs === 2 ? 2 : 1,
    },
  });

  revalidatePath("/dashboard");
}
