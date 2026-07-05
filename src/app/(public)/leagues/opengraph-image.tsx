import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";

export const alt = "ลีกทั้งหมด";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [count, kanit] = await Promise.all([
    prisma.league.count({ where: { status: { not: "DRAFT" }, hidden: false } }),
    readFile(join(process.cwd(), "src/assets/fonts/Kanit-Bold.ttf")),
  ]);

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
        <div style={{ fontSize: 80, display: "flex" }}>
          ลีก<span style={{ color: "#D4FF3A" }}>ทั้งหมด</span>
        </div>
        <div style={{ fontSize: 34, color: "rgba(255,255,255,.55)", marginTop: 12, display: "flex" }}>
          {count} ลีกที่เปิดให้ชมบน 88ArenaLeague
        </div>
        <div style={{ fontSize: 28, color: "rgba(255,255,255,.4)", marginTop: 46, display: "flex" }}>
          88ARENA<span style={{ color: "#D4FF3A" }}>LEAGUE</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Kanit", data: kanit, style: "normal", weight: 700 }] }
  );
}
