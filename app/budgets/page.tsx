"use client";

import { useCallback, useEffect, useState } from "react";
import { Budget } from "@/types";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { formatCurrency, formatPercent, startOfMonth, endOfMonth, monthsAgo } from "@/lib/formatters";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { BudgetCategoryBar } from "@/components/charts/BudgetCategoryBar";
import { BASE_PATH } from "@/lib/demo/mode";

interface BudgetWithSpend extends Budget {
  spent: number;
  percent: number;
}

interface MonthlySpend {
  month: string;
  [category: string]: number | string;
}

function BudgetForm({ onSave, onCancel }: { onSave: (b: Budget) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ category: "Food & Dining", amount: "", period: "monthly" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`${BASE_PATH}/api/budgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select label="Category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
        {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Input label="Monthly budget" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="500" required />
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={saving} className="flex-1">{saving ? "Saving…" : "Save Budget"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

async function fetchPage() {
  const now = new Date();
  const yearAgo = monthsAgo(11);
  const [budgetsRes, txRes, annualTxRes] = await Promise.all([
    fetch(`${BASE_PATH}/api/budgets`),
    fetch(`${BASE_PATH}/api/transactions?from=${startOfMonth(now).toISOString()}&to=${endOfMonth(now).toISOString()}&limit=500`),
    fetch(`${BASE_PATH}/api/transactions?from=${startOfMonth(yearAgo).toISOString()}&to=${endOfMonth(now).toISOString()}&limit=2000`),
  ]);
  const allBudgets: Budget[] = await budgetsRes.json();
  const { transactions } = await txRes.json();
  const { transactions: annualTxs } = await annualTxRes.json();

  const spendMap: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.amount < 0 && !tx.isTransfer) {
      spendMap[tx.category] = (spendMap[tx.category] ?? 0) + Math.abs(tx.amount);
    }
  }

  const withSpend: BudgetWithSpend[] = allBudgets.map((b) => ({
    ...b,
    spent: spendMap[b.category] ?? 0,
    percent: b.amount > 0 ? ((spendMap[b.category] ?? 0) / b.amount) * 100 : 0,
  }));

  // Build annual monthly spend data for budget categories
  const budgetCats = allBudgets.map((b) => b.category);
  const monthMap: Record<string, Record<string, number>> = {};
  for (const tx of annualTxs) {
    if (tx.amount < 0 && !tx.isTransfer && budgetCats.includes(tx.category)) {
      const month = tx.date.slice(0, 7);
      if (!monthMap[month]) monthMap[month] = {};
      monthMap[month][tx.category] = (monthMap[month][tx.category] ?? 0) + Math.abs(tx.amount);
    }
  }

  const sortedMonths = Object.keys(monthMap).sort();
  const rows: MonthlySpend[] = sortedMonths.map((m) => ({
    month: m,
    ...monthMap[m],
  }));

  const activeCats = budgetCats.filter((cat) =>
    rows.some((r) => typeof r[cat] === "number" && (r[cat] as number) > 0)
  );

  return { budgets: withSpend, rows, activeCats };
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetWithSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [annualData, setAnnualData] = useState<MonthlySpend[]>([]);
  const [annualCategories, setAnnualCategories] = useState<string[]>([]);



  const apply = useCallback((d: Awaited<ReturnType<typeof fetchPage>>) => {
    setBudgets(d.budgets);
    setAnnualData(d.rows);
    setAnnualCategories(d.activeCats);
    setLoading(false);
  }, []);
  const load = () => fetchPage().then(apply);

  // State is set when the data arrives, not during the effect itself.
  useEffect(() => { fetchPage().then(apply); }, [apply]);

  async function deleteBudget(id: string) {
    await fetch(`${BASE_PATH}/api/budgets/${id}`, { method: "DELETE" });
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  }

  function barColor(pct: number) {
    if (pct >= 100) return "bg-red-500";
    if (pct >= 75) return "bg-amber-500";
    return "bg-emerald-500";
  }

  return (
    <div className="px-4 py-6 lg:px-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Budgets</h1>
        <Button onClick={() => setModalOpen(true)}>+ Add Budget</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-zinc-800 rounded-xl animate-pulse" />)}
        </div>
      ) : budgets.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500 text-center py-6">No budgets set. Add one to start tracking.</p>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {budgets.map((b) => (
              <Card key={b.id} className="group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-zinc-100">{b.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-zinc-400">
                      {formatCurrency(b.spent, "USD", true)} / {formatCurrency(b.amount, "USD", true)}
                    </span>
                    <span className={`text-xs font-medium ${b.percent >= 100 ? "text-red-400" : b.percent >= 75 ? "text-amber-400" : "text-emerald-400"}`}>
                      {formatPercent(b.percent, 0)}
                    </span>
                    <button onClick={() => deleteBudget(b.id)} className="hidden group-hover:block text-zinc-600 hover:text-red-400 text-xs cursor-pointer">Remove</button>
                  </div>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor(b.percent)}`} style={{ width: `${Math.min(b.percent, 100)}%` }} />
                </div>
              </Card>
            ))}
          </div>

          {annualData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Annual Spending by Category</CardTitle>
                <span className="text-xs text-zinc-500">Last 12 months</span>
              </CardHeader>
              <BudgetCategoryBar data={annualData} categories={annualCategories} currency="USD" height={260} />
            </Card>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Budget">
        <BudgetForm onSave={(b) => { setBudgets((prev) => { const idx = prev.findIndex((x) => x.category === b.category); return idx >= 0 ? prev.map((x) => x.category === b.category ? { ...b, spent: x.spent, percent: x.percent } : x) : [...prev, { ...b, spent: 0, percent: 0 }]; }); setModalOpen(false); load(); }} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
