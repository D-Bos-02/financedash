// Daily copies of the SQLite database, made with SQLite's online backup so a copy is never half-written.
// BACKUP_DIR (e.g. a folder in iCloud Drive) decides where they go; otherwise ./backups.

import fs from "fs/promises";
import path from "path";
import Database from "better-sqlite3";
import { getDbPath } from "@/lib/prisma";

const KEEP = 30;
const MIN_HOURS_BETWEEN = 20;
const PREFIX = "finance-";

export function backupDir(): string {
  return process.env.BACKUP_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "backups");
}

export interface BackupStatus {
  dir: string;
  last: { file: string; at: string; bytes: number } | null;
  count: number;
}

async function listBackups(dir: string) {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names
      .filter((n) => n.startsWith(PREFIX) && n.endsWith(".db"))
      .map(async (n) => ({ name: n, stat: await fs.stat(path.join(/*turbopackIgnore: true*/ dir, n)) }))
  );
  return files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

export async function backupStatus(): Promise<BackupStatus> {
  const dir = backupDir();
  const files = await listBackups(dir);
  const last = files[0];
  return {
    dir,
    last: last ? { file: last.name, at: last.stat.mtime.toISOString(), bytes: last.stat.size } : null,
    count: files.length,
  };
}

// Backs up unless a recent copy exists (or force), then keeps only the newest KEEP copies.
export async function runBackup(force = false): Promise<BackupStatus & { created: boolean }> {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const existing = await listBackups(dir);
  const recent = existing[0] && Date.now() - existing[0].stat.mtimeMs < MIN_HOURS_BETWEEN * 3600_000;
  if (recent && !force) return { ...(await backupStatus()), created: false };

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const db = new Database(getDbPath(), { readonly: true, fileMustExist: true });
  try {
    await db.backup(path.join(/*turbopackIgnore: true*/ dir, `${PREFIX}${stamp}.db`));
  } finally {
    db.close();
  }

  for (const old of (await listBackups(dir)).slice(KEEP)) await fs.unlink(path.join(/*turbopackIgnore: true*/ dir, old.name));
  return { ...(await backupStatus()), created: true };
}
