import { prisma } from "@/lib/db";

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) return new Response("Not found", { status: 404 });

  const [players, goals, yellows, assists] = await Promise.all([
    prisma.player.findMany({
      where: { team: { leagueId: id } },
      include: { team: true },
      orderBy: [{ team: { name: "asc" } }, { number: "asc" }],
    }),
    prisma.matchEvent.groupBy({
      by: ["playerId"],
      where: { type: "GOAL", playerId: { not: null }, match: { leagueId: id } },
      _count: { playerId: true },
    }),
    prisma.matchEvent.groupBy({
      by: ["playerId"],
      where: { type: "YELLOW_CARD", playerId: { not: null }, match: { leagueId: id } },
      _count: { playerId: true },
    }),
    prisma.matchEvent.groupBy({
      by: ["relatedPlayerId"],
      where: { type: "GOAL", relatedPlayerId: { not: null }, match: { leagueId: id } },
      _count: { relatedPlayerId: true },
    }),
  ]);
  const goalMap = new Map(goals.map((g) => [g.playerId, g._count.playerId]));
  const yellowMap = new Map(yellows.map((g) => [g.playerId, g._count.playerId]));
  const assistMap = new Map(assists.map((g) => [g.relatedPlayerId, g._count.relatedPlayerId]));

  const rows = [
    ["ทีม", "เบอร์", "ชื่อ", "ชื่อเล่น", "ตำแหน่ง", "สถานะ", "ประตู", "แอสซิสต์", "ใบเหลือง"],
    ...players.map((p) => [
      p.team.name,
      p.number,
      p.name,
      p.nickname ?? "-",
      p.position,
      p.status,
      goalMap.get(p.id) ?? 0,
      assistMap.get(p.id) ?? 0,
      yellowMap.get(p.id) ?? 0,
    ]),
  ];
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="players-${id}.csv"`,
    },
  });
}
