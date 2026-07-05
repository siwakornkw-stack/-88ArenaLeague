"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, signSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export type LoginState = { error?: string };

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isLockedOut(email: string) {
  const rec = attempts.get(email);
  return !!rec && rec.resetAt > Date.now() && rec.count >= MAX_ATTEMPTS;
}
function recordFailure(email: string) {
  const now = Date.now();
  const rec = attempts.get(email);
  if (!rec || rec.resetAt <= now) {
    attempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 1000) {
      for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
    }
  } else {
    rec.count++;
  }
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (isLockedOut(email)) {
    return { error: "พยายามเข้าสู่ระบบหลายครั้งเกินไป ลองใหม่ในภายหลัง" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailure(email);
    return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }

  attempts.delete(email);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = await signSession({ userId: user.id, role: user.role, name: user.name });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect(user.role === "SUPER_ADMIN" ? "/dashboard" : "/teams/mine");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
