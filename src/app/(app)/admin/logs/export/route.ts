import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action")?.trim() || null;
  const league = url.searchParams.get("league")?.trim() || null;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromDate = from ? new Date(`${from}T00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  const logs = await prisma.adminLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(league ? { leagueId: league } : {}),
      ...(fromDate && !isNaN(fromDate.getTime()) ? { createdAt: { gte: fromDate } } : {}),
      ...(toDate && !isNaN(toDate.getTime())
        ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), lte: toDate } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

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
