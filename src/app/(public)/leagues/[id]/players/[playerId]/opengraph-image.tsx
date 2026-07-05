import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";

export const alt = "ข้อมูลนักเตะ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string; playerId: string }>;
}) {
  const { id, playerId } = await params;
  const [player, goals, assists, kanit] = await Promise.all([
    prisma.player.findFirst({
      where: { id: playerId, team: { leagueId: id } },
      include: { team: true },
    }),
    prisma.matchEvent.count({ where: { playerId, type: "GOAL" } }),
    prisma.matchEvent.count({ where: { relatedPlayerId: playerId, type: "GOAL" } }),
    readFile(join(process.cwd(), "src/assets/fonts/Kanit-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 60,
          background: "linear-gradient(135deg, #12240F 0%, #101410 60%)",
          color: "#fff",
          fontFamily: "Kanit",
        }}
      >
        {player?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photoUrl}
            alt=""
            width={220}
            height={220}
            style={{ borderRadius: 999, objectFit: "cover", border: "4px solid #D4FF3A" }}
          />
        ) : (
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: 999,
              background: player?.team.color ?? "#2E5CB8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 90,
            }}
          >
            {player?.number ?? "?"}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, display: "flex" }}>{player?.name ?? "นักเตะ"}</div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,.55)", display: "flex" }}>
            #{player?.number} · {player?.position} · {player?.team.name}
          </div>
          <div style={{ fontSize: 40, color: "#D4FF3A", marginTop: 18, display: "flex" }}>
            ⚽ {goals} ประตู · 🅰 {assists} แอสซิสต์
          </div>
          <div style={{ fontSize: 26, color: "rgba(255,255,255,.4)", marginTop: 30, display: "flex" }}>
            88ARENA<span style={{ color: "#D4FF3A" }}>LEAGUE</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Kanit", data: kanit, style: "normal", weight: 700 }] }
  );
}
