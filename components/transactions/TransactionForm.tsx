"use client";

import { useState, FormEvent } from "react";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { Account, Transaction } from "@/types";

interface TransactionFormProps {
  accounts: Account[];
  initial?: Partial<Transaction>;
  onSave: (tx: Transaction) => void;
  onCancel: () => void;
}

export function TransactionForm({ accounts, initial, onSave, onCancel }: TransactionFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    accountId: initial?.accountId ?? accounts[0]?.id ?? "",
    date: initial?.date ? new Date(initial.date).toISOString().slice(0, 10) : today,
    merchant: initial?.merchant ?? "",
    amount: initial?.amount?.toString() ?? "",
    category: initial?.category ?? "Other",
    notes: initial?.notes ?? "",
    isTransfer: initial?.isTransfer ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const method = initial?.id ? "PUT" : "POST";
      const url = initial?.id ? `/api/transactions/${initial.id}` : "/api/transactions";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const tx = await res.json();
      onSave(tx);
    } catch {
      setError("Failed to save transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function set(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select
        label="Account"
        id="accountId"
        value={form.accountId}
        onChange={(e) => set("accountId", e.target.value)}
        required
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date"
          id="date"
          type="date"
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
          required
        />
        <Input
          label="Amount"
          id="amount"
          type="number"
          step="0.01"
          placeholder="-42.50"
          value={form.amount}
          onChange={(e) => set("amount", e.target.value)}
          required
        />
      </div>
      <Input
        label="Merchant"
        id="merchant"
        placeholder="Whole Foods"
        value={form.merchant}
        onChange={(e) => set("merchant", e.target.value)}
        required
      />
      <Select
        label="Category"
        id="category"
        value={form.category}
        onChange={(e) => set("category", e.target.value)}
      >
        {DEFAULT_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </Select>
      <Input
        label="Notes (optional)"
        id="notes"
        placeholder="..."
        value={form.notes}
        onChange={(e) => set("notes", e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isTransfer}
          onChange={(e) => set("isTransfer", e.target.checked)}
          className="rounded accent-violet-500"
        />
        Mark as transfer (excluded from P&L)
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? "Saving…" : initial?.id ? "Update" : "Add Transaction"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
