"use client";

import { useRef, useState } from "react";

export type SaveState = "saved" | "saving" | "error";

// Edits are saved shortly after the last change. Patches to the same URL merge, so a burst of edits is one request.
export function useAutosave(delay = 600) {
  const [state, setState] = useState<SaveState>("saved");
  const pending = useRef(new Map<string, Record<string, unknown>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current.entries()];
    pending.current.clear();
    if (!batch.length) return;
    try {
      const results = await Promise.all(
        batch.map(([u, body]) =>
          fetch(u, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
        )
      );
      setState(results.every((r) => r.ok) ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  function save(url: string, patch: Record<string, unknown>, replace = false) {
    pending.current.set(url, replace ? patch : { ...pending.current.get(url), ...patch });
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }

  // Drop queued edits for a record that's being deleted.
  function forget(url: string) {
    pending.current.delete(url);
  }

  return { state, save, flush, forget };
}
