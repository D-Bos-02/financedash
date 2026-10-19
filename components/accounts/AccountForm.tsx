"use client";

import { useState } from "react";
import { Account } from "@/types";
import type { Member } from "@/lib/household";
import { COMMON_CURRENCIES } from "@/lib/household";
import { ACCOUNT_TYPES } from "@/lib/categories";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function AccountForm({
  initial,
  members,
  baseCurrency,
  onSave,
  onCancel,
}: {
  initial?: Partial<Account>;
  members: Member[];
  baseCurrency: string;
  onSave: (a: Account) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    type: initial?.type ?? "checking",
    currency: initial?.currency ?? baseCurrency,
    institution: initial?.institution ?? "",
    balance: initial?.balance?.toString() ?? "0",
    balanceMode: initial?.balanceMode ?? "manual",
    // A solo profile's new accounts belong to its one member.
    ownerId: initial ? initial.ownerId ?? "" : members.length === 1 ? members[0].id : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const method = initial?.id ? "PUT" : "POST";
      const url = initial?.id ? `/api/accounts/${initial.id}` : "/api/accounts";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) }),
      });
      if (!res.ok) throw new Error();
      onSave(await res.json());
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Account name" id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Chase Checking" />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" id="type" value={form.type} onChange={(e) => set("type", e.target.value)}>
          {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select label="Currency" id="currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
          {[...new Set([baseCurrency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Institution (optional)" id="institution" value={form.institution} onChange={(e) => set("institution", e.target.value)} placeholder="JPMorgan Chase" />
        <Select label="Owner" id="ownerId" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
          <option value="">Shared</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Balance" id="balance" type="number" step="0.01" value={form.balance} onChange={(e) => set("balance", e.target.value)} />
        <Select label="Balance mode" id="balanceMode" value={form.balanceMode} onChange={(e) => set("balanceMode", e.target.value)}>
          <option value="manual">Manual</option>
          <option value="derived">Derived from transactions</option>
        </Select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={saving} className="flex-1">{saving ? "Saving…" : initial?.id ? "Update" : "Add Account"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
