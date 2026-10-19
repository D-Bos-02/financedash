"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SESSION_KEY = "plaid-synced";

interface SyncResult {
  institution: string | null;
  ok: boolean;
  added: number;
  modified: number;
  error?: string;
}

// Syncs every bank connection, refreshes FX rates and makes the daily database backup once when the app
// is opened (once per browser tab),
// then refreshes the page so it shows the new data. Only speaks up when something changed or failed.
export function AutoSync() {
  const router = useRouter();
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Storage blocked: sync anyway.
    }

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const [res, fx] = await Promise.all([
          fetch("/api/plaid/sync", { method: "POST" }),
          fetch("/api/fx-rates/refresh", { method: "POST" }).catch(() => null),
          // Skips itself if a backup was made in the last day.
          fetch("/api/backup", { method: "POST" }).catch(() => null),
        ]);
        if (!res.ok) {
          if (fx?.ok) router.refresh();
          return; // Plaid not configured
        }
        const { results } = (await res.json()) as { results: SyncResult[] };
        const failed = results.filter((r) => !r.ok);
        const changes = results.reduce((s, r) => s + (r.ok ? r.added + r.modified : 0), 0);

        if (failed.length) {
          setNotice({ text: `Couldn't sync ${failed.map((r) => r.institution ?? "a bank").join(", ")}`, error: true });
        } else if (changes) {
          setNotice({ text: `Synced ${changes} new or updated transaction${changes > 1 ? "s" : ""}`, error: false });
          hideTimer = setTimeout(() => setNotice(null), 4000);
        }
        if (changes || fx?.ok) router.refresh();
      } catch {
        // Offline: leave the last synced data in place.
      }
    })();
    return () => clearTimeout(hideTimer);
  }, [router]);

  if (!notice) return null;
  return (
    <div className="fixed bottom-24 lg:bottom-6 right-4 z-50 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm shadow-lg">
      <span className={notice.error ? "text-amber-400" : "text-zinc-300"}>{notice.text}</span>
      {notice.error && (
        <Link href="/accounts" className="text-violet-400 hover:text-violet-300" onClick={() => setNotice(null)}>
          Fix
        </Link>
      )}
      <button aria-label="Dismiss" onClick={() => setNotice(null)} className="text-zinc-500 hover:text-zinc-300">×</button>
    </div>
  );
}
