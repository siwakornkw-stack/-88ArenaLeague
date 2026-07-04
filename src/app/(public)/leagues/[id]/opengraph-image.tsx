import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/standings";

export const alt = "ตารางคะแนน";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, standings, kanit] = await Promise.all([
    prisma.league.findUnique({ where: { id }, include: { teams: true } }),
    computeStandings(id),
    readFile(join(process.cwd(), "src/assets/fonts/Kanit-Bold.ttf")),
  ]);

  const top3 = standings.slice(0, 3);

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
        <div style={{ fontSize: 72, display: "flex", padding: "0 80px", textAlign: "center" }}>
          {league?.name ?? "88ArenaLeague"}
        </div>
        <div style={{ fontSize: 32, color: "rgba(255,255,255,.55)", marginTop: 10, display: "flex" }}>
          ฤดูกาล {league?.seasonYear ?? ""} · {league?.teams.length ?? 0} ทีม
        </div>
        {top3.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40, gap: 14 }}>
            {top3.map((r, i) => (
              <div
                key={r.teamId}
                style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 38 }}
              >
                <div style={{ color: "#D4FF3A", display: "flex", width: 40 }}>{i + 1}</div>
                <div style={{ display: "flex", width: 480 }}>{r.teamName}</div>
                <div style={{ color: "#D4FF3A", display: "flex" }}>{r.points} แต้ม</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 28, color: "rgba(255,255,255,.4)", marginTop: 50, display: "flex" }}>
          88ARENA<span style={{ color: "#D4FF3A" }}>LEAGUE</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Kanit", data: kanit, style: "normal", weight: 700 }] }
  );
}
