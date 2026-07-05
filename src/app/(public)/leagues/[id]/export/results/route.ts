import { prisma } from "@/lib/db";

const STAGE_LABEL: Record<string, string> = {
  LEAGUE: "ลีก",
  SEMI_FINAL: "รอบรองชนะเลิศ",
  FINAL: "นัดชิงชนะเลิศ",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "ยังไม่แข่ง",
  LIVE: "กำลังแข่ง",
  FINISHED: "จบแล้ว",
};

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) return new Response("Not found", { status: 404 });

  const matches = await prisma.match.findMany({
    where: { leagueId: id },
    include: { homeTeam: true, awayTeam: true, mvpPlayer: true },
    orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
  });

  const rows = [
    ["นัดที่", "รอบ", "วันเวลา", "เหย้า", "สกอร์", "เยือน", "สนาม", "สถานะ", "MVP", "ผู้ตัดสิน", "ผู้ชม", "หมายเหตุ"],
    ...matches.map((m) => [
      m.round,
      STAGE_LABEL[m.stage] ?? m.stage,
      m.kickoffAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }),
      m.homeTeam.name,
      m.status === "SCHEDULED" ? "-" : `${m.homeScore}-${m.awayScore}`,
      m.awayTeam.name,
      m.venue ?? "-",
      STATUS_LABEL[m.status] ?? m.status,
      m.mvpPlayer?.name ?? "-",
      m.refereeName ?? "-",
      m.spectators ?? "-",
      m.note ?? "-",
    ]),
  ];
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="results-${id}.csv"`,
    },
  });
}
