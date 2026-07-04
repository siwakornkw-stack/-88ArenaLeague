import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

export async function logAdmin(session: SessionPayload, action: string, detail: string) {
  await prisma.adminLog.create({
    data: { userId: session.userId, userName: session.name, action, detail },
  });
}
