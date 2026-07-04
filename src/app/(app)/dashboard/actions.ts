"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

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
