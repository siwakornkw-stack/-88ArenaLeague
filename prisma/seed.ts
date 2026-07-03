import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEAM_NAMES: [string, string][] = [
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

const ROSTER: { name: string; number: number; position: string }[] = [
  { name: "ธนกร ใจดี", number: 1, position: "GK" },
  { name: "วีระชัย สมบูรณ์", number: 4, position: "DF" },
  { name: "ประสิทธิ์ แก้วมณี", number: 5, position: "DF" },
  { name: "สมชาย รักไทย", number: 6, position: "DF" },
  { name: "อนุชา ทองดี", number: 8, position: "MF" },
  { name: "กิตติพงษ์ ศรีสุข", number: 10, position: "MF" },
  { name: "ณัฐพล บุญมี", number: 11, position: "MF" },
  { name: "ชัยวัฒน์ พงษ์ไทย", number: 9, position: "FW" },
  { name: "ปิยะ วงศ์สวัสดิ์", number: 7, position: "FW" },
];

async function main() {
  const adminPasswordHash = await bcrypt.hash("admin1234", 10);
  const managerPasswordHash = await bcrypt.hash("manager1234", 10);

  await prisma.user.upsert({
    where: { email: "admin@leaguehub.dev" },
    update: {},
    create: {
      email: "admin@leaguehub.dev",
      passwordHash: adminPasswordHash,
      name: "ผู้ดูแลระบบ",
      role: "SUPER_ADMIN",
    },
  });

  const league = await prisma.league.create({
    data: {
      name: "สิงห์บุรี ซันเดย์ลีก",
      seasonYear: 2026,
      type: "round_robin",
      legs: 2,
      status: "DRAFT",
      teams: {
        create: TEAM_NAMES.map(([name, abbr]) => ({ name, abbr })),
      },
    },
    include: { teams: true },
  });

  const firstTeam = league.teams[0];

  await prisma.player.createMany({
    data: ROSTER.map((p) => ({ ...p, teamId: firstTeam.id })),
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@leaguehub.dev" },
    update: {},
    create: {
      email: "manager@leaguehub.dev",
      passwordHash: managerPasswordHash,
      name: "ผู้จัดการทีม",
      role: "TEAM_MANAGER",
    },
  });

  await prisma.team.update({
    where: { id: firstTeam.id },
    data: { managers: { connect: { id: manager.id } } },
  });

  console.log("Seed complete:", { league: league.name, teams: league.teams.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
