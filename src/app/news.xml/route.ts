import { prisma } from "@/lib/db";

const BASE = "https://league-manager-app.vercel.app";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  const news = await prisma.leagueNews.findMany({
    include: { league: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const items = news
    .map(
      (n) => `    <item>
      <title>${esc(`[${n.league.name}] ${n.title}`)}</title>
      <link>${BASE}/leagues/${n.leagueId}?tab=news</link>
      <guid isPermaLink="false">${n.id}</guid>
      <pubDate>${n.createdAt.toUTCString()}</pubDate>
      <description>${esc(n.body)}</description>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>88ArenaLeague - ข่าวสารทุกลีก</title>
    <link>${BASE}</link>
    <description>ประกาศและข่าวสารจากทุกลีกบน 88ArenaLeague</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
