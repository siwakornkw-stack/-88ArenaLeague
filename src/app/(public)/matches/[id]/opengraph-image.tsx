import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";

export const alt = "ผลการแข่งขัน";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match, kanit] = await Promise.all([
    prisma.match.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true, league: true },
    }),
    readFile(join(process.cwd(), "src/assets/fonts/Kanit-Bold.ttf")),
  ]);

  const home = match?.homeTeam.name ?? "ทีมเหย้า";
  const away = match?.awayTeam.name ?? "ทีมเยือน";
  const score = !match || match.status === "SCHEDULED" ? "vs" : `${match.homeScore} - ${match.awayScore}`;
  const league = match?.league.name ?? "88ArenaLeague";
  const statusLabel =
    match?.status === "LIVE" ? "● LIVE" : match?.status === "FINISHED" ? "จบการแข่งขัน" : "โปรแกรมแข่ง";

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
        <div style={{ fontSize: 36, color: "#D4FF3A", display: "flex" }}>{league}</div>
        <div style={{ fontSize: 30, color: "rgba(255,255,255,.55)", marginTop: 8, display: "flex" }}>
          {statusLabel}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 60,
            marginTop: 40,
            padding: "0 60px",
          }}
        >
          <div style={{ fontSize: 56, display: "flex", maxWidth: 380, textAlign: "right" }}>{home}</div>
          <div style={{ fontSize: 110, color: "#D4FF3A", display: "flex", fontStyle: "italic" }}>
            {score}
          </div>
          <div style={{ fontSize: 56, display: "flex", maxWidth: 380 }}>{away}</div>
        </div>
        <div style={{ fontSize: 28, color: "rgba(255,255,255,.4)", marginTop: 50, display: "flex" }}>
          88ARENA<span style={{ color: "#D4FF3A" }}>LEAGUE</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Kanit", data: kanit, style: "normal", weight: 700 }] }
  );
}
