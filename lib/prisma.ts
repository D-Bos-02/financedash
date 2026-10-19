import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { DEMO } from "@/lib/demo/mode";
import { visitorPrisma } from "@/lib/demo/visitor-db";

export function getDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const filePath = url.replace(/^file:/, "");
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), filePath);
}

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: getDbPath() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (PrismaClient as any)({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// The hosted demo gives each visitor their own database; everywhere else there's the one in DATABASE_URL.
export const prisma = DEMO ? visitorPrisma() : (globalForPrisma.prisma ?? createClient());

if (!DEMO && process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
