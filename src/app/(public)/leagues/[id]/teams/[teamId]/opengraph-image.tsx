import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";

export const alt = "ข้อมูลทีม";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;
  const [team, standings, kanit] = await Promise.all([
    prisma.team.findFirst({ where: { id: teamId, leagueId: id }, include: { league: true } }),
    computeStandings(id),
    readFile(join(process.cwd(), "src/assets/fonts/Kanit-Bold.ttf")),
  ]);

  const rank = standings.findIndex((r) => r.teamId === teamId) + 1;
  const row = standings.find((r) => r.teamId === teamId);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #12240F 0%, #101410 60%)",
          color: "#fff",
          fontFamily: "Kanit",
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 999,
            background: team?.color ?? "#2E5CB8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
          }}
        >
          {team?.abbr ?? "?"}
        </div>
        <div style={{ fontSize: 68, marginTop: 24, display: "flex" }}>{team?.name ?? "ทีม"}</div>
        <div style={{ fontSize: 32, color: "rgba(255,255,255,.55)", marginTop: 8, display: "flex" }}>
          {team?.league.name ?? ""}
          {rank > 0 && row ? ` · อันดับ ${rank} · ${row.points} แต้ม` : ""}
        </div>
        <div style={{ fontSize: 28, color: "rgba(255,255,255,.4)", marginTop: 40, display: "flex" }}>
          88ARENA<span style={{ color: "#D4FF3A" }}>LEAGUE</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Kanit", data: kanit, style: "normal", weight: 700 }] }
  );
}
