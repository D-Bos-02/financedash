"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { BackupStatus } from "@/lib/backup";

export function BackupCard() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/backup").then((r) => r.json()).then(setStatus).catch(() => setError("Couldn't read backup status"));
  }, []);

  async function backupNow() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const body = await res.json();
    if (res.ok) setStatus(body);
    else setError(body.error ?? "Backup failed");
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backups</CardTitle>
        <Button variant="secondary" size="sm" onClick={backupNow} disabled={busy}>{busy ? "Backing up…" : "Back up now"}</Button>
      </CardHeader>
      <p className="text-sm text-zinc-300">
        {status?.last
          ? `Last backup ${new Date(status.last.at).toLocaleString()} · ${status.count} kept`
          : status ? "No backups yet" : "…"}
      </p>
      {status && <p className="text-xs text-zinc-500 mt-1 break-all">{status.dir}</p>}
      <p className="text-xs text-zinc-500 mt-2">
        A copy is made automatically once a day when you open the app, and the last 30 are kept. Bank connections in a
        backup only work with the same PLAID_TOKEN_KEY, so keep a copy of your .env in your password manager.
      </p>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </Card>
  );
}
