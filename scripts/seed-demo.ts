// Fills the database with the fictional demo household (see lib/demo/seed.ts).
//
//   npm run seed:demo                 refuses if the database already has data
//   npm run seed:demo -- --reset      wipes the database first (all of it)
//
// Tip: keep your real data separate with DATABASE_URL="file:./demo.db" npm run seed:demo

import { existsSync } from "node:fs";

import type { PrismaClient } from "@/app/generated/prisma/client";
import { seedDemo } from "@/lib/demo/seed";

// Load .env before the Prisma client reads DATABASE_URL; the client is imported in main() for that reason.
if (existsSync(".env")) process.loadEnvFile(".env");
let prisma: PrismaClient;

async function isEmpty() {
  const [profiles, accounts, txs] = await Promise.all([prisma.profile.count(), prisma.account.count(), prisma.transaction.count()]);
  return profiles + accounts + txs === 0;
}

// Children first, so foreign keys never block a delete.
async function wipe() {
  await prisma.$transaction([
    prisma.goalContribution.deleteMany(), prisma.goalAccount.deleteMany(), prisma.goal.deleteMany(),
    prisma.incomeSource.deleteMany(), prisma.holding.deleteMany(), prisma.balanceSnapshot.deleteMany(),
    prisma.transaction.deleteMany(), prisma.account.deleteMany(), prisma.plaidItem.deleteMany(), prisma.member.deleteMany(),
    prisma.budget.deleteMany(), prisma.categoryRule.deleteMany(), prisma.fxRate.deleteMany(),
    prisma.plannerState.deleteMany(), prisma.chatConversation.deleteMany(), prisma.profile.deleteMany(), prisma.settings.deleteMany(),
  ]);
}

async function main() {
  prisma = (await import("@/lib/prisma")).prisma;
  const reset = process.argv.includes("--reset");
  if (!(await isEmpty())) {
    if (!reset) {
      console.error("The database already has data. Run with --reset to wipe it and load the demo household instead,\n" +
        'or point DATABASE_URL at a separate file, e.g. DATABASE_URL="file:./demo.db" npm run seed:demo');
      process.exitCode = 1;
      return;
    }
    await wipe();
  }

  const transactions = await seedDemo(prisma);
  console.log(`Demo household loaded: 2 people, 9 accounts, ${transactions} transactions, 4 goals.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma?.$disconnect());
