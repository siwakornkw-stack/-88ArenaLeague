"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { roundRobin, buildKickoffDates } from "@/lib/schedule";
import { computeStandings } from "@/lib/standings";
import { uploadImage } from "@/lib/blobUpload";
import { logAdmin } from "@/lib/audit";
import { getSession } from "@/lib/session";

export async function generateSchedule(leagueId: string, dayOfWeek: number, start: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: true },
  });

  const existing = await prisma.match.count({ where: { leagueId } });
  if (existing > 0) throw new Error("Schedule already exists");

  const startDate = start ? new Date(`${start}T00:00`) : null;
  const startFrom = startDate && !isNaN(startDate.getTime()) ? startDate : undefined;

  const fixtures = roundRobin(
    league.teams.map((t) => t.id),
    league.legs
  );
  const totalRounds = Math.max(...fixtures.map((f) => f.round));
  const kickoffDates = buildKickoffDates(totalRounds, dayOfWeek, startFrom);
  const homeVenueByTeam = new Map(league.teams.map((t) => [t.id, t.homeVenue]));

  await prisma.$transaction([
    prisma.match.createMany({
      data: fixtures.map((f) => ({
        leagueId,
        round: f.round,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        kickoffAt: kickoffDates[f.round - 1],
        venue: homeVenueByTeam.get(f.homeTeamId) ?? null,
      })),
    }),
    prisma.league.update({ where: { id: leagueId }, data: { status: "SCHEDULED" } }),
  ]);

  await logAdmin(session, "สร้างตารางแข่ง", `${league.name} · ${fixtures.length} แมตช์`);
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function finishSeason(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const [total, unfinished] = await Promise.all([
    prisma.match.count({ where: { leagueId } }),
    prisma.match.count({ where: { leagueId, status: { not: "FINISHED" } } }),
  ]);
  if (total === 0 || unfinished > 0) throw new Error("ยังมีแมตช์ที่ไม่จบการแข่งขัน");

  const league = await prisma.league.update({
    where: { id: leagueId },
    data: { status: "FINISHED" },
  });
  await logAdmin(session, "ปิดฤดูกาล", league.name);
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function generatePlayoffs(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const matches = await prisma.match.findMany({ where: { leagueId } });
  const leagueStage = matches.filter((m) => m.stage === "LEAGUE");
  if (leagueStage.length === 0 || leagueStage.some((m) => m.status !== "FINISHED")) {
    throw new Error("ลีกยังแข่งไม่ครบทุกนัด");
  }
  if (matches.some((m) => m.stage !== "LEAGUE")) throw new Error("สร้างเพลย์ออฟแล้ว");

  const standings = await computeStandings(leagueId);
  if (standings.length < 4) throw new Error("ต้องมีอย่างน้อย 4 ทีม");

  const maxRound = Math.max(...leagueStage.map((m) => m.round));
  const semiDay = new Date();
  semiDay.setDate(semiDay.getDate() + 7);
  const semi1At = new Date(semiDay);
  semi1At.setHours(15, 0, 0, 0);
  const semi2At = new Date(semiDay);
  semi2At.setHours(17, 0, 0, 0);

  await prisma.match.createMany({
    data: [
      {
        leagueId,
        round: maxRound + 1,
        stage: "SEMI_FINAL",
        homeTeamId: standings[0].teamId,
        awayTeamId: standings[3].teamId,
        kickoffAt: semi1At,
      },
      {
        leagueId,
        round: maxRound + 1,
        stage: "SEMI_FINAL",
        homeTeamId: standings[1].teamId,
        awayTeamId: standings[2].teamId,
        kickoffAt: semi2At,
      },
    ],
  });
  await logAdmin(session, "สร้างเพลย์ออฟ", `ลีก ${leagueId} · รอบรองชนะเลิศ`);
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function generateFinal(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const semis = await prisma.match.findMany({
    where: { leagueId, stage: "SEMI_FINAL" },
    orderBy: { kickoffAt: "asc" },
  });
  if (semis.length !== 2 || semis.some((m) => m.status !== "FINISHED")) {
    throw new Error("รอบรองชนะเลิศยังไม่จบ");
  }
  const existingFinal = await prisma.match.count({ where: { leagueId, stage: "FINAL" } });
  if (existingFinal > 0) throw new Error("สร้างนัดชิงแล้ว");

  // knockout draws are settled by better league seed
  const standings = await computeStandings(leagueId);
  const seed = new Map(standings.map((r, i) => [r.teamId, i]));
  const winnerOf = (m: (typeof semis)[number]) =>
    m.homeScore > m.awayScore
      ? m.homeTeamId
      : m.awayScore > m.homeScore
        ? m.awayTeamId
        : (seed.get(m.homeTeamId) ?? 99) < (seed.get(m.awayTeamId) ?? 99)
          ? m.homeTeamId
          : m.awayTeamId;

  const finalAt = new Date();
  finalAt.setDate(finalAt.getDate() + 7);
  finalAt.setHours(17, 0, 0, 0);

  await prisma.match.create({
    data: {
      leagueId,
      round: semis[0].round + 1,
      stage: "FINAL",
      homeTeamId: winnerOf(semis[0]),
      awayTeamId: winnerOf(semis[1]),
      kickoffAt: finalAt,
    },
  });
  await logAdmin(session, "สร้างนัดชิงชนะเลิศ", `ลีก ${leagueId}`);
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function setLeagueVenue(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const venue = String(formData.get("venue") ?? "").trim();
  if (!venue) return;

  const res = await prisma.match.updateMany({
    where: { leagueId, status: "SCHEDULED" },
    data: { venue },
  });
  await logAdmin(session, "ตั้งสนามทั้งลีก", `${venue} · ${res.count} แมตช์`, leagueId);
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function shiftSeason(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const days = Math.round(Number(formData.get("days")) || 0);
  if (days === 0 || Math.abs(days) > 365) return;

  const scheduled = await prisma.match.findMany({
    where: { leagueId, status: "SCHEDULED" },
    select: { id: true, kickoffAt: true },
  });
  await prisma.$transaction(
    scheduled.map((m) =>
      prisma.match.update({
        where: { id: m.id },
        data: { kickoffAt: new Date(m.kickoffAt.getTime() + days * 86400000) },
      })
    )
  );
  await logAdmin(session, "เลื่อนฤดูกาล", `ลีก ${leagueId} · ${days > 0 ? "+" : ""}${days} วัน · ${scheduled.length} แมตช์`);
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function deleteSchedule(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const matches = await prisma.match.findMany({ where: { leagueId }, select: { status: true } });
  if (matches.length === 0) return;
  if (matches.some((m) => m.status !== "SCHEDULED")) {
    throw new Error("ลบไม่ได้ มีแมตช์ที่เริ่มแข่งหรือจบไปแล้ว");
  }

  await prisma.$transaction([
    prisma.match.deleteMany({ where: { leagueId } }),
    prisma.league.update({ where: { id: leagueId }, data: { status: "DRAFT" } }),
  ]);
  await logAdmin(session, "ลบตารางแข่ง", `ลีก ${leagueId} · ${matches.length} แมตช์`);
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function updateLeague(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const seasonYear = Number(formData.get("seasonYear"));
  const description = String(formData.get("description") ?? "").trim();
  const clampZone = (key: string) => {
    const n = Math.round(Number(formData.get(key)) || 0);
    return Math.min(20, Math.max(0, n));
  };
  if (!name || !Number.isInteger(seasonYear)) return;

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      name,
      seasonYear,
      description: description || null,
      promotedCount: clampZone("promotedCount"),
      relegatedCount: clampZone("relegatedCount"),
      registrationOpen: formData.get("registrationOpen") === "on",
      hidden: formData.get("hidden") === "on",
      rulesUrl: /^https?:\/\//.test(String(formData.get("rulesUrl") ?? "").trim())
        ? String(formData.get("rulesUrl")).trim()
        : null,
    },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function duplicateLeague(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: { include: { players: true, managers: true } } },
  });

  const copy = await prisma.league.create({
    data: {
      name: league.name,
      seasonYear: league.seasonYear + 1,
      type: league.type,
      legs: league.legs,
      status: "DRAFT",
      teams: {
        create: league.teams.map((t) => ({
          name: t.name,
          abbr: t.abbr,
          color: t.color,
          managers: { connect: t.managers.map((m) => ({ id: m.id })) },
          players: {
            create: t.players.map((p) => ({
              name: p.name,
              number: p.number,
              position: p.position,
            })),
          },
        })),
      },
    },
  });

  await logAdmin(session, "คัดลอกลีก", `${league.name} → ฤดูกาล ${copy.seasonYear}`);
  redirect(`/admin/leagues/${copy.id}`);
}

export async function createNews(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const pinned = formData.get("pinned") === "on";
  const publishRaw = String(formData.get("publishAt") ?? "").trim();
  const publishDate = publishRaw ? new Date(publishRaw) : null;
  if (!title || !body) return;

  await prisma.leagueNews.create({
    data: {
      leagueId,
      title,
      body,
      pinned,
      publishAt: publishDate && !isNaN(publishDate.getTime()) ? publishDate : null,
    },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function updateNews(leagueId: string, newsId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const news = await prisma.leagueNews.findUniqueOrThrow({ where: { id: newsId } });
  if (news.leagueId !== leagueId) throw new Error("Invalid news");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const pinned = formData.get("pinned") === "on";
  if (!title || !body) return;

  await prisma.leagueNews.update({ where: { id: newsId }, data: { title, body, pinned } });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function deleteNews(leagueId: string, newsId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const news = await prisma.leagueNews.findUniqueOrThrow({ where: { id: newsId } });
  if (news.leagueId !== leagueId) throw new Error("Invalid news");

  await prisma.leagueNews.delete({ where: { id: newsId } });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function createSponsor(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const name = String(formData.get("name") ?? "").trim();
  const urlRaw = String(formData.get("url") ?? "").trim();
  if (!name) return;
  const url = /^https?:\/\//.test(urlRaw) ? urlRaw : null;

  const logoUrl = await uploadImage(`sponsor-logos/${leagueId}`, formData.get("logo"));
  await prisma.leagueSponsor.create({ data: { leagueId, name, url, logoUrl } });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function deleteSponsor(leagueId: string, sponsorId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const sponsor = await prisma.leagueSponsor.findUniqueOrThrow({ where: { id: sponsorId } });
  if (sponsor.leagueId !== leagueId) throw new Error("Invalid sponsor");

  await prisma.leagueSponsor.delete({ where: { id: sponsorId } });
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}`);
}

export async function rescheduleRound(leagueId: string, formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const round = Number(formData.get("round"));
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const venue = String(formData.get("venue") ?? "").trim();
  if (!Number.isInteger(round) || !date || !time) return;

  const kickoffAt = new Date(`${date}T${time}`);
  if (isNaN(kickoffAt.getTime())) return;

  await prisma.match.updateMany({
    where: { leagueId, round, status: "SCHEDULED" },
    data: { kickoffAt, ...(venue ? { venue } : {}) },
  });
  revalidatePath(`/admin/leagues/${leagueId}`);
}

export async function deleteLeague(leagueId: string) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

  const league = await prisma.league.delete({ where: { id: leagueId } });
  await logAdmin(session, "ลบลีก", league.name);
  redirect("/dashboard");
}
