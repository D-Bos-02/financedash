"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BASE_PATH, REPO_URL } from "@/lib/demo/mode";

const button =
  "rounded-md border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-60 transition-colors";

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
    <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3 bg-gradient-to-r from-violet-700 to-fuchsia-700 text-white shadow-lg">
      <p className="flex items-center gap-2.5 text-sm">
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold tracking-wider text-violet-700">DEMO</span>
        <span>
          <strong className="font-semibold">You&apos;re trying FinanceDash with made-up data.</strong>{" "}
          <span className="text-white/85">Changes are only visible to you, and are cleared {hours} hours after your last visit.</span>
        </span>
      </p>
      <span className="flex flex-wrap justify-center gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => startOver(false)}>Reset</button>
        <button type="button" className={button} disabled={busy} onClick={() => startOver(true)}>Try setup from scratch</button>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 transition-colors">
          Get it on GitHub →
        </a>
      </span>
    </div>
  );
}
