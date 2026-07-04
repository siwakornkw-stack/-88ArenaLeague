import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// One-off: rotate the seed accounts' passwords on whatever DB DATABASE_URL points to.
// Reads SEED_ADMIN_PASSWORD / SEED_MANAGER_PASSWORD if set, else generates strong ones.
function strong() {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || strong();
  const managerPassword = process.env.SEED_MANAGER_PASSWORD || strong();

  await prisma.user.update({
    where: { email: "admin@leaguehub.dev" },
    data: { passwordHash: await bcrypt.hash(adminPassword, 10) },
  });
  await prisma.user.update({
    where: { email: "manager@leaguehub.dev" },
    data: { passwordHash: await bcrypt.hash(managerPassword, 10) },
  });

  console.log("Rotated credentials:");
  console.log("  admin@leaguehub.dev   :", adminPassword);
  console.log("  manager@leaguehub.dev :", managerPassword);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
