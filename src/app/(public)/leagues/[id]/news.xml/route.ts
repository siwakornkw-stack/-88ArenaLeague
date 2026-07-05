import { prisma } from "@/lib/db";

const BASE = "https://league-manager-app.vercel.app";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league) return new Response("Not found", { status: 404 });

  const news = await prisma.leagueNews.findMany({
    where: { leagueId: id, OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const items = news
    .map(
      (n) => `    <item>
      <title>${esc(n.title)}</title>
      <link>${BASE}/leagues/${id}?tab=news</link>
      <guid isPermaLink="false">${n.id}</guid>
      <pubDate>${n.createdAt.toUTCString()}</pubDate>
      <description>${esc(n.body)}</description>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(league.name)} - ข่าวสาร</title>
    <link>${BASE}/leagues/${id}?tab=news</link>
    <description>ประกาศและข่าวสารจาก ${esc(league.name)}</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
