import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const BASE = "https://league-manager-app.vercel.app";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [leagues, teams, matches] = await Promise.all([
    prisma.league.findMany({ where: { status: { not: "DRAFT" } }, select: { id: true } }),
    prisma.team.findMany({
      where: { league: { status: { not: "DRAFT" } } },
      select: { id: true, leagueId: true },
    }),
    prisma.match.findMany({
      where: { league: { status: { not: "DRAFT" } } },
      select: { id: true },
    }),
  ]);

  return [
    { url: BASE, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/leagues`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/champions`, changeFrequency: "weekly", priority: 0.5 },
    ...leagues.map((l) => ({
      url: `${BASE}/leagues/${l.id}`,
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
    ...teams.map((t) => ({
      url: `${BASE}/leagues/${t.leagueId}/teams/${t.id}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...matches.map((m) => ({
      url: `${BASE}/matches/${m.id}`,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
  ];
}
