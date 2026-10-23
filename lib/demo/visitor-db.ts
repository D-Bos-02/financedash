// The hosted demo gives every visitor their own copy of the demo household: a SQLite file in the temp folder,
// picked by the visitor cookie (set in proxy.ts). On a host with several server instances (Vercel), each change
// is also saved to Upstash Redis, so whichever instance serves the next request can pick it up. Without Redis
// configured, the files simply live on the one server. Only used when DEMO is on; see lib/prisma.ts.

import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import Database from "better-sqlite3";
import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { after } from "next/server";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { seedDemo } from "./seed";
import { VISITOR_COOKIE } from "./mode";

// A visitor's copy is forgotten this long after their last visit.
export const VISITOR_TTL_HOURS = 4;
const TTL_MS = VISITOR_TTL_HOURS * 3_600_000;
// Requests this close together trust the local file without asking Redis again (a page load makes several).
const RECHECK_MS = 2_000;

const DIR = path.join(os.tmpdir(), "financedash-demo");
const ID = /^[0-9a-f-]{36}$/;

function openClient(file: string): PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (PrismaClient as any)({ adapter: new PrismaBetterSqlite3({ url: file }) });
}

// --- Redis (optional) ------------------------------------------------------------------------------

// The Vercel Upstash integration sets KV_REST_API_*; a plain Upstash database gives UPSTASH_REDIS_REST_*.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken, automaticDeserialization: false }) : null;
const dataKey = (id: string) => `financedash:demo:${id}:db`;
const versionKey = (id: string) => `financedash:demo:${id}:v`;

// --- Templates --------------------------------------------------------------------------------------

// An empty database with the current schema, built from the migration files.
async function buildEmpty(file: string) {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "prisma", "migrations");
  const db = new Database(file);
  try {
    for (const name of readdirSync(dir).filter((n) => existsSync(path.join(dir, n, "migration.sql"))).sort()) {
      db.exec(readFileSync(path.join(dir, name, "migration.sql"), "utf8"));
    }
  } finally {
    db.close();
  }
}

// The demo household, rebuilt once a day so its dates stay current.
async function buildSeeded(file: string) {
  await copyFile(await template("empty"), file);
  const client = openClient(file);
  try {
    await seedDemo(client);
  } finally {
    await client.$disconnect();
  }
}

const templates = new Map<string, Promise<string>>();

function template(kind: "empty" | "seeded"): Promise<string> {
  const name = kind === "empty" ? "template-empty.db" : `template-${new Date().toISOString().slice(0, 10)}.db`;
  let pending = templates.get(name);
  if (!pending) {
    pending = (async () => {
      await mkdir(DIR, { recursive: true });
      const file = path.join(DIR, name);
      if (existsSync(file)) return file;
      // Build beside it and rename, so a half-built template is never used.
      const temp = `${file}.${randomUUID()}.tmp`;
      await (kind === "empty" ? buildEmpty(temp) : buildSeeded(temp));
      await rename(temp, file);
      if (kind === "seeded") removeOldTemplates(name);
      return file;
    })();
    pending.catch(() => templates.delete(name));
    templates.set(name, pending);
  }
  return pending;
}

function removeOldTemplates(keep: string) {
  readdir(DIR).then((names) => {
    for (const n of names) {
      if (/^template-\d{4}-\d{2}-\d{2}\.db$/.test(n) && n !== keep) {
        templates.delete(n);
        rm(path.join(DIR, n), { force: true }).catch(() => {});
      }
    }
  }).catch(() => {});
}

// --- Visitors --------------------------------------------------------------------------------------

interface Visitor {
  client: PrismaClient | null;
  version: string | null; // the Redis version this file matches
  checkedAt: number;
}

const visitors = new Map<string, Visitor>();
const ready = new Map<string, Promise<PrismaClient>>(); // in-flight loads, so parallel requests share one
const dirty = new Set<string>();

const fileFor = (id: string) => path.join(DIR, `visitor-${id}.db`);

async function closeClient(v: Visitor | undefined) {
  if (v?.client) await v.client.$disconnect().catch(() => {});
  if (v) v.client = null;
}

// Makes sure the visitor's file is the latest copy, then returns a client for it.
async function load(id: string): Promise<PrismaClient> {
  const file = fileFor(id);
  let v = visitors.get(id);
  if (!v) visitors.set(id, (v = { client: null, version: null, checkedAt: 0 }));
  const now = Date.now();

  if (now - v.checkedAt > RECHECK_MS || !existsSync(file)) {
    const remote = redis ? await redis.get<string>(versionKey(id)) : null;
    if (remote && remote !== v.version) {
      // Changed on another server instance (or this instance has never seen this visitor).
      const blob = await redis!.get<string>(dataKey(id));
      if (blob) {
        await closeClient(v);
        await mkdir(DIR, { recursive: true });
        await writeFile(file, gunzipSync(Buffer.from(blob, "base64")));
        v.version = remote;
      }
    }
    if (!existsSync(file)) {
      await closeClient(v);
      if (!v.version) removeExpired();
      await copyFile(await template("seeded"), file);
    }
    v.checkedAt = now;
    await utimes(file, new Date(), new Date()).catch(() => {});
  }

  if (!v.client) v.client = openClient(file);
  return v.client;
}

function clientFor(id: string): Promise<PrismaClient> {
  let pending = ready.get(id);
  if (!pending) {
    pending = load(id).finally(() => ready.delete(id));
    ready.set(id, pending);
  }
  return pending;
}

// Saves the visitor's copy to Redis after the response is sent. Several writes in one request upload once.
function persistLater(id: string) {
  if (!redis || dirty.has(id)) return;
  dirty.add(id);
  after(() => persist(id));
}

async function persist(id: string) {
  dirty.delete(id);
  if (!redis) return;
  const v = visitors.get(id);
  const version = randomUUID();
  const blob = gzipSync(await readFile(fileFor(id))).toString("base64");
  const ex = Math.round(TTL_MS / 1000);
  await redis.pipeline().set(dataKey(id), blob, { ex }).set(versionKey(id), version, { ex }).exec();
  if (v) v.version = version;
}

// Deletes copies nobody has opened for a while. Runs when a new visitor arrives.
function removeExpired() {
  readdir(DIR).then(async (names) => {
    for (const n of names) {
      const m = /^visitor-(.+)\.db$/.exec(n);
      if (!m || ready.has(m[1])) continue;
      const file = path.join(DIR, n);
      const { mtimeMs } = await stat(file).catch(() => ({ mtimeMs: Date.now() }));
      if (Date.now() - mtimeMs < TTL_MS) continue;
      await closeClient(visitors.get(m[1]));
      visitors.delete(m[1]);
      await rm(file, { force: true }).catch(() => {});
    }
  }).catch(() => {});
}

async function visitorId(): Promise<string> {
  const id = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!id || !ID.test(id)) throw new Error("No demo visitor cookie.");
  return id;
}

// Starts the visitor over: the demo household again, or an empty database so the setup wizard shows.
export async function resetVisitor(blank: boolean) {
  const id = await visitorId();
  await ready.get(id)?.catch(() => {});
  const v = visitors.get(id);
  await closeClient(v);
  await mkdir(DIR, { recursive: true });
  await copyFile(await template(blank ? "empty" : "seeded"), fileFor(id));
  if (v) v.checkedAt = Date.now();
  await persist(id);
}

// --- The Prisma client the app uses in demo mode ---------------------------------------------------------

const WRITES = new Set([
  "create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany",
  "$executeRaw", "$executeRawUnsafe", "$transaction",
]);

type AnyFn = (...args: unknown[]) => unknown;

async function run(write: boolean, call: (client: PrismaClient) => unknown) {
  const id = await visitorId();
  const result = await call(await clientFor(id));
  if (write) persistLater(id);
  return result;
}

// Looks like a PrismaClient, but each call goes to the current visitor's database.
// Calls start straight away, so $transaction([...]) can't make them atomic: it just waits for them all.
// The only callers that use that form are the Plaid routes, which the demo turns off.
export function visitorPrisma(): PrismaClient {
  const handler: ProxyHandler<object> = {
    get(_, key) {
      if (typeof key !== "string" || key === "then") return undefined;
      if (key === "$transaction") {
        // Each call in the array has already been sent (and saved) on its own.
        return (arg: unknown, ...rest: unknown[]) => Array.isArray(arg)
          ? Promise.all(arg)
          : run(true, (c) => (c.$transaction as AnyFn)(arg, ...rest));
      }
      if (key.startsWith("$")) {
        return (...args: unknown[]) => run(WRITES.has(key), (c) => ((c as unknown as Record<string, AnyFn>)[key])(...args));
      }
      return new Proxy({}, {
        get(_, method) {
          if (typeof method !== "string" || method === "then") return undefined;
          return (...args: unknown[]) =>
            run(WRITES.has(method), (c) => ((c as unknown as Record<string, Record<string, AnyFn>>)[key][method])(...args));
        },
      });
    },
  };
  return new Proxy({}, handler) as PrismaClient;
}
