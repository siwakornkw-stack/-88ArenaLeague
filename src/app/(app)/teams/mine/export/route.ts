import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const team = await prisma.team.findFirst({
    where: { managers: { some: { id: session.userId } } },
    include: { players: { orderBy: { number: "asc" } } },
  });
  if (!team) return new Response("Not found", { status: 404 });

  const rows = [
    ["เบอร์", "ชื่อ", "ชื่อเล่น", "ตำแหน่ง", "ปีเกิด", "สถานะ"],
    ...team.players.map((p) => [
      p.number,
      p.name,
      p.nickname ?? "-",
      p.position,
      p.birthYear ?? "-",
      p.status,
    ]),
  ];
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roster-${team.id}.csv"`,
    },
  });
}
