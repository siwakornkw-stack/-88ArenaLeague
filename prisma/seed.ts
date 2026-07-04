import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { roundRobin } from "../src/lib/schedule";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ---- deterministic PRNG so re-seeding gives the same demo every time ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260704);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const FIRST_NAMES = [
  "ธนกร", "วีระชัย", "ประสิทธิ์", "สมชาย", "อนุชา", "กิตติพงษ์", "ณัฐพล", "ชัยวัฒน์",
  "ปิยะ", "สุริยา", "อภิสิทธิ์", "ธีรศักดิ์", "วิชัย", "ก้องภพ", "จิรายุ", "ภาณุพงศ์",
  "เอกชัย", "นครินทร์", "พงศกร", "รัชชานนท์",
];
const LAST_NAMES = [
  "ใจดี", "สมบูรณ์", "แก้วมณี", "รักไทย", "ทองดี", "ศรีสุข", "บุญมี", "พงษ์ไทย",
  "วงศ์สวัสดิ์", "จันทร์เพ็ญ", "เกียรติศักดิ์", "ประเสริฐ", "มั่นคง", "รุ่งเรือง",
  "แสงทอง", "พูลสุข", "ชูเกียรติ", "ดำรงค์",
];
// jersey number + position code, aligned index-for-index
const NUMBERS = [1, 4, 5, 6, 8, 10, 11, 9, 7];
const POSITIONS = ["GK", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW"];
const ATTACKER_POS = new Set(["MF", "FW"]);

const COLORS = [
  "#2E5CB8", "#166534", "#B91C1C", "#3A3A3A", "#0E7490", "#B45309",
  "#64748B", "#1E293B", "#9A3412", "#5B21B6", "#0F766E", "#1D4ED8",
];

const VENUES = [
  "สนามกีฬาเทศบาลสิงห์บุรี",
  "สนามฟุตบอลกลางจังหวัด",
  "อารีน่า 88 สเตเดียม",
  "สนามโรงเรียนกีฬา",
];

const KICKOFF_TIMES: [number, number][] = [[9, 30], [10, 45], [15, 0], [17, 0]];

const todayMidnight = new Date();
todayMidnight.setHours(0, 0, 0, 0);

function roundDate(round: number, todayRound: number) {
  const d = new Date(todayMidnight);
  d.setDate(d.getDate() + (round - todayRound) * 7);
  return d;
}
function atTime(day: Date, idx: number) {
  const [h, m] = KICKOFF_TIMES[idx % KICKOFF_TIMES.length];
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function simScore(homeId: string, awayId: string, favId?: string): [number, number] {
  let h = randInt(0, 3);
  let a = randInt(0, 3);
  if (favId && homeId === favId) h = Math.min(6, h + randInt(1, 2));
  if (favId && awayId === favId) a = Math.min(6, a + randInt(1, 2));
  return [h, a];
}
function statFields() {
  const poss = randInt(40, 60);
  const shots = randInt(6, 16);
  const shotsAway = randInt(4, 14);
  return {
    homePossession: poss,
    awayPossession: 100 - poss,
    homeShots: shots,
    awayShots: shotsAway,
    homeShotsOnTarget: randInt(2, Math.max(2, shots - 2)),
    awayShotsOnTarget: randInt(1, Math.max(1, shotsAway - 2)),
    homeCorners: randInt(2, 9),
    awayCorners: randInt(1, 8),
    homeFouls: randInt(5, 14),
    awayFouls: randInt(5, 14),
  };
}

type SeededPlayer = { id: string; teamId: string; number: number; position: string };

async function wipe() {
  await prisma.matchEvent.deleteMany();
  await prisma.matchLineup.deleteMany();
  await prisma.match.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.league.deleteMany();
}

async function seedCompetitiveLeague(opts: {
  name: string;
  type: string;
  teamDefs: [string, string][];
  todayRound: number;
  favTeamIndex?: number;
}) {
  const league = await prisma.league.create({
    data: {
      name: opts.name,
      seasonYear: 2026,
      type: opts.type,
      legs: 1,
      status: "IN_PROGRESS",
      teams: {
        create: opts.teamDefs.map(([name, abbr], i) => ({
          name,
          abbr,
          color: COLORS[i % COLORS.length],
        })),
      },
    },
    include: { teams: true },
  });

  // stable team order matches teamDefs order
  const teams = opts.teamDefs.map(
    ([name]) => league.teams.find((t) => t.name === name)!
  );
  const teamIds = teams.map((t) => t.id);
  const favId = opts.favTeamIndex !== undefined ? teamIds[opts.favTeamIndex] : undefined;

  await prisma.player.createMany({
    data: teams.flatMap((t) =>
      NUMBERS.map((number, i) => ({
        teamId: t.id,
        number,
        position: POSITIONS[i],
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      }))
    ),
  });

  const players: SeededPlayer[] = await prisma.player.findMany({
    where: { teamId: { in: teamIds } },
    select: { id: true, teamId: true, number: true, position: true },
  });
  const playersByTeam = new Map<string, SeededPlayer[]>();
  for (const p of players) {
    if (!playersByTeam.has(p.teamId)) playersByTeam.set(p.teamId, []);
    playersByTeam.get(p.teamId)!.push(p);
  }
  const attackers = (teamId: string) =>
    playersByTeam.get(teamId)!.filter((p) => ATTACKER_POS.has(p.position));

  const fixtures = roundRobin(teamIds, 1);
  const byRound = new Map<number, typeof fixtures>();
  for (const f of fixtures) {
    if (!byRound.has(f.round)) byRound.set(f.round, []);
    byRound.get(f.round)!.push(f);
  }

  const eventsData: Prisma.MatchEventCreateManyInput[] = [];
  const lineupsData: Prisma.MatchLineupCreateManyInput[] = [];

  const decideStatus = (round: number, idx: number): "FINISHED" | "LIVE" | "SCHEDULED" => {
    if (round < opts.todayRound) return "FINISHED";
    if (round > opts.todayRound) return "SCHEDULED";
    if (idx === 0) return "FINISHED";
    if (idx === 1 || idx === 2) return "LIVE";
    return "SCHEDULED";
  };

  for (const [round, roundFixtures] of byRound) {
    const day = roundDate(round, opts.todayRound);
    for (let idx = 0; idx < roundFixtures.length; idx++) {
      const f = roundFixtures[idx];
      const status = decideStatus(round, idx);
      const kickoffAt = atTime(day, idx);

      if (status === "SCHEDULED") {
        await prisma.match.create({
          data: {
            leagueId: league.id,
            round,
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            kickoffAt,
            venue: pick(VENUES),
            status: "SCHEDULED",
          },
        });
        continue;
      }

      const [homeScore, awayScore] =
        status === "LIVE"
          ? [randInt(0, 2), randInt(0, 2)]
          : simScore(f.homeTeamId, f.awayTeamId, favId);

      const match = await prisma.match.create({
        data: {
          leagueId: league.id,
          round,
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          kickoffAt,
          venue: pick(VENUES),
          status,
          homeScore,
          awayScore,
          minute: status === "FINISHED" ? 90 : 0,
          ...statFields(),
        },
      });

      // lineups for both teams (drives apps counts + public lineup panel)
      for (const teamId of [f.homeTeamId, f.awayTeamId]) {
        for (const pl of playersByTeam.get(teamId)!) {
          lineupsData.push({ matchId: match.id, playerId: pl.id, isStarting: true });
        }
      }

      // event timeline
      const minutesAgo = status === "LIVE" ? randInt(18, 80) : 90;
      if (status === "LIVE") {
        eventsData.push({
          matchId: match.id,
          minute: 0,
          label: "เริ่มการแข่งขัน",
          type: "KICK_OFF",
          side: "NEUTRAL",
          createdAt: new Date(Date.now() - minutesAgo * 60000),
        });
      } else {
        eventsData.push({
          matchId: match.id,
          minute: 0,
          label: "เริ่มการแข่งขัน",
          type: "KICK_OFF",
          side: "NEUTRAL",
        });
      }

      const goalPlan: { side: "HOME" | "AWAY"; teamId: string }[] = [];
      for (let i = 0; i < homeScore; i++) goalPlan.push({ side: "HOME", teamId: f.homeTeamId });
      for (let i = 0; i < awayScore; i++) goalPlan.push({ side: "AWAY", teamId: f.awayTeamId });
      for (const g of goalPlan) {
        const scorer = pick(attackers(g.teamId));
        eventsData.push({
          matchId: match.id,
          minute: randInt(1, Math.max(2, minutesAgo - 1)),
          label: "ประตู",
          type: "GOAL",
          side: g.side,
          playerId: scorer.id,
        });
      }

      if (status === "FINISHED" && rand() < 0.4) {
        const side = rand() < 0.5 ? "HOME" : "AWAY";
        const teamId = side === "HOME" ? f.homeTeamId : f.awayTeamId;
        const booked = pick(playersByTeam.get(teamId)!);
        eventsData.push({
          matchId: match.id,
          minute: randInt(20, 85),
          label: "ใบเหลือง",
          type: "YELLOW_CARD",
          side,
          playerId: booked.id,
        });
      }

      if (status === "FINISHED") {
        eventsData.push({
          matchId: match.id,
          minute: 90,
          label: "จบการแข่งขัน",
          type: "FULL_TIME",
          side: "NEUTRAL",
        });
      }
    }
  }

  await prisma.matchEvent.createMany({ data: eventsData });
  await prisma.matchLineup.createMany({ data: lineupsData });

  return { league, teams, playersByTeam };
}

const LEAGUE1_TEAMS: [string, string][] = [
  ["สิงห์บุรี ยูไนเต็ด", "SU"],
  ["ราชสีห์", "RS"],
  ["อินทรีแดง", "IR"],
  ["เสือดำ เอฟซี", "BP"],
  ["ช้างเผือก", "CP"],
  ["มังกรทอง", "MT"],
  ["พยัคฆ์ขาว", "PK"],
  ["เหยี่ยวดำ", "YD"],
  ["กระทิงเพลิง", "KP"],
  ["หงส์เหนือ", "HN"],
  ["นาคราช", "NR"],
  ["จ้าวสมุทร", "JS"],
];

const LEAGUE2_TEAMS: [string, string][] = [
  ["ทีซีบี แบงก์", "TCB"],
  ["ปตท. สปิริต", "PTT"],
  ["เอสซีจี ยูไนเต็ด", "SCG"],
  ["ไทยเบฟ วอริเออร์ส", "TBW"],
  ["ซีพี ออลสตาร์", "CPA"],
  ["เอไอเอส ไดนาโม", "AIS"],
  ["กสิกร เอฟซี", "KBF"],
  ["ปูนใหญ่ ซิตี้", "SCC"],
];

const LEAGUE3_TEAMS: [string, string][] = [
  ["ซัมเมอร์ ฮอว์กส์", "SH"],
  ["บีชบอยส์", "BB"],
  ["ซันเซ็ต เอฟซี", "SS"],
  ["ทรอปิคอล ยูไนเต็ด", "TU"],
  ["ลากูน สตาร์", "LS"],
  ["ปาล์มมี่ ซิตี้", "PC"],
];

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const managerPassword = process.env.SEED_MANAGER_PASSWORD;
  if (!adminPassword || !managerPassword) {
    throw new Error("Set SEED_ADMIN_PASSWORD and SEED_MANAGER_PASSWORD before seeding");
  }
  const [adminHash, managerHash] = await Promise.all([
    bcrypt.hash(adminPassword, 10),
    bcrypt.hash(managerPassword, 10),
  ]);

  await prisma.user.upsert({
    where: { email: "admin@leaguehub.dev" },
    update: { passwordHash: adminHash },
    create: {
      email: "admin@leaguehub.dev",
      passwordHash: adminHash,
      name: "ผู้ดูแลระบบ",
      role: "SUPER_ADMIN",
    },
  });
  const manager = await prisma.user.upsert({
    where: { email: "manager@leaguehub.dev" },
    update: { passwordHash: managerHash },
    create: {
      email: "manager@leaguehub.dev",
      passwordHash: managerHash,
      name: "ผู้จัดการทีม",
      role: "TEAM_MANAGER",
    },
  });

  await wipe();

  // ---- League 1: primary showcase, IN_PROGRESS with 6 rounds played ----
  const l1 = await seedCompetitiveLeague({
    name: "สิงห์บุรี ซันเดย์ลีก",
    type: "ฟุตบอล 7 คน",
    teamDefs: LEAGUE1_TEAMS,
    todayRound: 7,
    favTeamIndex: 0, // SU climbs the table
  });

  const su = l1.teams[0];
  const suPlayers = l1.playersByTeam.get(su.id)!;

  // vary player availability so the roster filters + status badges have data
  await prisma.player.update({ where: { id: suPlayers[7].id }, data: { status: "INJURED" } });
  await prisma.player.update({ where: { id: suPlayers[2].id }, data: { status: "BANNED" } });

  // pre-fill a saved lineup for SU's next scheduled match (demo the lineup card)
  const suNext = await prisma.match.findFirst({
    where: {
      status: "SCHEDULED",
      OR: [{ homeTeamId: su.id }, { awayTeamId: su.id }],
    },
    orderBy: { kickoffAt: "asc" },
  });
  if (suNext) {
    const active = await prisma.player.findMany({
      where: { teamId: su.id, status: "ACTIVE" },
      select: { id: true },
    });
    await prisma.matchLineup.createMany({
      data: active.slice(0, 7).map((p) => ({ matchId: suNext.id, playerId: p.id, isStarting: true })),
    });
  }

  await prisma.team.update({
    where: { id: su.id },
    data: { managers: { connect: { id: manager.id } } },
  });

  // ---- League 2: corporate league, IN_PROGRESS, lighter ----
  await seedCompetitiveLeague({
    name: "แบงค็อก คอร์ปลีก",
    type: "ลีกองค์กร 11 คน",
    teamDefs: LEAGUE2_TEAMS,
    todayRound: 4,
  });

  // ---- League 3: DRAFT with teams but no schedule -> dashboard task "สร้างตาราง" ----
  await prisma.league.create({
    data: {
      name: "ซัมเมอร์ ซิกส์",
      seasonYear: 2026,
      type: "ฟุตบอล 6 คน",
      legs: 1,
      status: "DRAFT",
      teams: {
        create: LEAGUE3_TEAMS.map(([name, abbr], i) => ({
          name,
          abbr,
          color: COLORS[i % COLORS.length],
        })),
      },
    },
  });

  // ---- League 4: DRAFT, no teams -> dashboard task "เพิ่มทีม" ----
  await prisma.league.create({
    data: {
      name: "จูเนียร์ คัพ U15",
      seasonYear: 2026,
      type: "ลีกเยาวชน",
      legs: 2,
      status: "DRAFT",
    },
  });

  const [leagueCount, teamCount, playerCount, matchCount, liveCount] = await Promise.all([
    prisma.league.count(),
    prisma.team.count(),
    prisma.player.count(),
    prisma.match.count(),
    prisma.match.count({ where: { status: "LIVE" } }),
  ]);
  console.log("Seed complete:", { leagueCount, teamCount, playerCount, matchCount, liveCount });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
