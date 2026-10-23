import { NextRequest } from "next/server";
import { backupStatus, runBackup } from "@/lib/backup";

export async function GET() {
  return Response.json(await backupStatus());
}

// { force: true } backs up even if a copy was made in the last day.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(await runBackup(Boolean(body.force)));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Backup failed" }, { status: 500 });
  }
}
