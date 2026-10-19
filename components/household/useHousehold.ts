"use client";

import { useEffect, useState } from "react";
import {
  nextMemberColor, toGoal, toIncomeSource,
  type Goal, type GoalTemplate, type HouseholdData, type IncomeSource, type IncomeType, type Member, type Profile,
} from "@/lib/household";
import { goalFromTemplate } from "@/lib/goals";
import { useAutosave } from "./useAutosave";

const EMPTY: HouseholdData = { profile: null, members: [], sources: [], goals: [], accounts: [], plaidConfigured: false };

async function send<T>(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.json();
}

// New income sources start with sensible defaults for their type.
const SOURCE_STARTS: Record<IncomeType, Partial<IncomeSource>> = {
  salary: { name: "Salary", payFrequency: "monthly" },
  hourly: { name: "Wages", payFrequency: "biweekly" },
  freelance: { name: "Freelance", payFrequency: "irregular" },
  equity_vest: { name: "Stock vests", payFrequency: "quarterly", vestMonths: [3, 6, 9, 12], taxPct: 40 },
  other: { name: "Other income", payFrequency: "monthly" },
};

// The household being edited (wizard or Settings): local state that follows each change, with edits
// to existing records autosaved and creates/deletes sent straight away.
export function useHousehold(initial?: HouseholdData) {
  const [data, setData] = useState<HouseholdData>(initial ?? EMPTY);
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [error, setError] = useState("");
  const autosave = useAutosave();

  useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch("/api/household")
      .then((r) => r.json())
      .then((d: HouseholdData) => {
        if (!alive) return;
        setData(d);
        setLoaded(true);
      })
      .catch(() => alive && setError("Couldn't load your household."));
    return () => { alive = false; };
  }, [initial]);

  const set = (patch: Partial<HouseholdData>) => setData((d) => ({ ...d, ...patch }));
  // Run a create/delete and surface its error instead of throwing.
  async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return undefined;
    }
  }

  return {
    ...data,
    loaded,
    error,
    saveState: autosave.state,
    flush: autosave.flush,

    async saveProfile(patch: Partial<Profile> & { onboarded?: boolean }) {
      const saved = await attempt(() => send<Profile & { onboardedAt: string | null }>("/api/profile", "PUT", patch));
      if (saved) set({ profile: { householdType: saved.householdType, baseCurrency: saved.baseCurrency, timeZone: saved.timeZone, locale: saved.locale, onboardedAt: saved.onboardedAt } });
      return saved;
    },

    async addMember(name: string) {
      const color = nextMemberColor(data.members.map((m) => m.color));
      const m = await attempt(() => send<Member>("/api/members", "POST", { name, color, sortOrder: data.members.length }));
      if (m) setData((d) => ({ ...d, members: [...d.members, { id: m.id, name: m.name, color: m.color }] }));
      return m;
    },
    updateMember(id: string, patch: Partial<Member>) {
      setData((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
      autosave.save(`/api/members/${id}`, patch);
    },
    async removeMember(id: string) {
      autosave.forget(`/api/members/${id}`);
      if (await attempt(() => send("/api/members/" + id, "DELETE"))) {
        // Their income goes with them; their accounts become shared.
        setData((d) => ({
          ...d,
          members: d.members.filter((m) => m.id !== id),
          sources: d.sources.filter((s) => s.memberId !== id),
          accounts: d.accounts.map((a) => (a.ownerId === id ? { ...a, ownerId: null } : a)),
        }));
      }
    },

    async addSource(memberId: string | null, type: IncomeType) {
      const row = await attempt(() => send<Parameters<typeof toIncomeSource>[0]>("/api/income-sources", "POST", { memberId, type, ...SOURCE_STARTS[type] }));
      if (row) setData((d) => ({ ...d, sources: [...d.sources, toIncomeSource(row)] }));
    },
    updateSource(id: string, patch: Partial<IncomeSource>) {
      setData((d) => ({ ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
      autosave.save(`/api/income-sources/${id}`, patch);
    },
    async removeSource(id: string) {
      autosave.forget(`/api/income-sources/${id}`);
      if (await attempt(() => send("/api/income-sources/" + id, "DELETE"))) {
        setData((d) => ({ ...d, sources: d.sources.filter((s) => s.id !== id) }));
      }
    },

    async addGoal(template: GoalTemplate, monthlySpend = 0) {
      const priority = data.goals.reduce((p, g) => Math.max(p, g.priority + 1), 0);
      const row = await attempt(() => send<Parameters<typeof toGoal>[0]>("/api/goals", "POST", goalFromTemplate(template, monthlySpend, priority)));
      if (row) setData((d) => ({ ...d, goals: [...d.goals, toGoal(row)] }));
    },
    updateGoal(id: string, patch: Partial<Goal>) {
      setData((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
      autosave.save(`/api/goals/${id}`, patch);
    },
    async removeGoal(id: string) {
      autosave.forget(`/api/goals/${id}`);
      if (await attempt(() => send("/api/goals/" + id, "DELETE"))) {
        setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }));
      }
    },
    // Swap a goal's priority with its neighbour's, so the order is explicit and stable.
    moveGoal(id: string, direction: -1 | 1) {
      const sorted = [...data.goals].sort((a, b) => a.priority - b.priority);
      const i = sorted.findIndex((g) => g.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= sorted.length) return;
      const reordered = sorted.map((g, k) => ({ ...g, priority: k === i ? j : k === j ? i : k }));
      setData((d) => ({ ...d, goals: reordered }));
      for (const g of reordered) autosave.save(`/api/goals/${g.id}`, { priority: g.priority });
    },

    // After accounts change elsewhere (e.g. a Plaid link or the account form), pick up the new list.
    async reloadAccounts() {
      const fresh = await fetch("/api/household").then((r) => r.json() as Promise<HouseholdData>).catch(() => null);
      if (fresh) set({ accounts: fresh.accounts });
    },
  };
}

export type Household = ReturnType<typeof useHousehold>;
