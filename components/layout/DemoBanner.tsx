"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BASE_PATH, REPO_URL } from "@/lib/demo/mode";

const link = "font-medium underline underline-offset-2 hover:text-white disabled:opacity-60";

// The hosted demo's top bar: what this is, a way to start over, and where to get the app.
export function DemoBanner({ hours }: { hours: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function startOver(blank: boolean) {
    setBusy(true);
    await fetch(`${BASE_PATH}/api/demo/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blank }),
    }).catch(() => null);
    router.replace("/");
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="shrink-0 px-4 py-1.5 text-xs text-center text-violet-100 bg-violet-900/60 border-b border-violet-700/60">
      Demo with made-up data. Your changes are only visible to you, and are cleared {hours} hours after your last visit.{" "}
      <span className="inline-flex flex-wrap justify-center gap-x-3">
        <button type="button" className={link} disabled={busy} onClick={() => startOver(false)}>Reset</button>
        <button type="button" className={link} disabled={busy} onClick={() => startOver(true)}>Try setup from scratch</button>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className={link}>Get FinanceDash on GitHub →</a>
      </span>
    </div>
  );
}
