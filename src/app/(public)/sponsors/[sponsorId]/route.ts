import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ sponsorId: string }> }) {
  const { sponsorId } = await params;

  const sponsor = await prisma.leagueSponsor.findUnique({ where: { id: sponsorId } });
  if (!sponsor) return new Response("Not found", { status: 404 });

  await prisma.leagueSponsor.update({
    where: { id: sponsorId },
    data: { clicks: { increment: 1 } },
  });

  const dest = sponsor.url ?? `/leagues/${sponsor.leagueId}`;
  return Response.redirect(
    dest.startsWith("http") ? dest : `https://league-manager-app.vercel.app${dest}`,
    302
  );
}
