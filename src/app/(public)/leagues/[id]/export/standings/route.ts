import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) return new Response("Not found", { status: 404 });

  const standings = await computeStandings(id);
  const rows = [
    ["อันดับ", "ทีม", "แข่ง", "ชนะ", "เสมอ", "แพ้", "ได้", "เสีย", "ผลต่าง", "แต้ม"],
    ...standings.map((r, i) => [
      i + 1,
      r.teamName,
      r.played,
      r.won,
      r.drawn,
      r.lost,
      r.goalsFor,
      r.goalsAgainst,
      r.goalDiff,
      r.points,
    ]),
  ];
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="standings-${id}.csv"`,
    },
  });
}
