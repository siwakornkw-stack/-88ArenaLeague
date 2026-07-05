import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") return new Response("Unauthorized", { status: 401 });

  const logs = await prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 2000 });

  const rows = [
    ["เวลา", "ผู้ใช้", "การกระทำ", "รายละเอียด", "ลีก"],
    ...logs.map((l) => [
      l.createdAt.toISOString(),
      l.userName,
      l.action,
      l.detail,
      l.leagueId ?? "-",
    ]),
  ];
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="admin-logs.csv"',
    },
  });
}
