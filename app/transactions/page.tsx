"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Transaction, Account } from "@/types";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { formatCurrency } from "@/lib/formatters";
import { TransactionList } from "@/components/transactions/TransactionList";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { CsvImporter } from "@/components/transactions/CsvImporter";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";

type ModalMode = "new" | "edit" | "csv" | null;

interface Filters {
  search: string;
  accountId: string;
  category: string;
  period: PeriodKey;
  from: string; // YYYY-MM-DD, inclusive; "" for open-ended
  to: string;
  excludeTransfers: boolean;
}

const PERIODS = [
  { key: "all", label: "All time" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "this-year", label: "This year" },
  { key: "last-year", label: "Last year" },
  { key: "custom", label: "Custom range" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Date range for a preset, in calendar days.
function periodRange(key: PeriodKey, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear(), m = today.getMonth();
  const daysBack = (n: number) => ymd(new Date(y, m, today.getDate() - n));
  switch (key) {
    case "this-month": return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case "last-month": return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "30d": return { from: daysBack(29), to: ymd(today) };
    case "90d": return { from: daysBack(89), to: ymd(today) };
    case "this-year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last-year": return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default: return { from: "", to: "" };
  }
}

// The preset a range corresponds to, or "custom".
function periodFor(from: string, to: string): PeriodKey {
  if (!from && !to) return "all";
  const match = PERIODS.find((p) => p.key !== "all" && p.key !== "custom" && periodRange(p.key).from === from && periodRange(p.key).to === to);
  return match?.key ?? "custom";
}

function rangeLabel(from: string, to: string): string {
  const fmt = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  return from ? `From ${fmt(from)}` : `Until ${fmt(to)}`;
}

// Filters can arrive in the URL, e.g. /transactions?category=Food%20%26%20Dining&month=2026-10&excludeTransfers=1
// (month is a Cash Flow click-through; from/to take YYYY-MM-DD).
export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsFromUrl />
    </Suspense>
  );
}

function TransactionsFromUrl() {
  const params = useSearchParams();
  const month = params.get("month") ?? "";
  let from = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") ?? "") ? params.get("from")! : "";
  let to = /^\d{4}-\d{2}-\d{2}$/.test(params.get("to") ?? "") ? params.get("to")! : "";
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    from = `${month}-01`;
    to = `${month}-${pad(new Date(y, m, 0).getDate())}`;
  }
  const initial: Filters = {
    search: "",
    accountId: "",
    category: params.get("category") ?? "",
    period: periodFor(from, to),
    from,
    to,
    excludeTransfers: params.get("excludeTransfers") === "1",
  };
  // A new link (e.g. another category) starts from its own filters.
  return <TransactionsView key={params.toString()} initial={initial} />;
}

async function fetchTransactions(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.category) params.set("category", filters.category);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.excludeTransfers) params.set("excludeTransfers", "1");
  params.set("limit", "50");
  const res = await fetch(`/api/transactions?${params}`);
  return res.json() as Promise<{ transactions: Transaction[]; total: number; spent?: number; received?: number }>;
}

function TransactionsView({ initial }: { initial: Filters }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ spent: 0, received: 0 });
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Transaction | undefined>();

  const [filters, setFilters] = useState<Filters>(initial);
  // The filters the list on screen was loaded for; it's loading while they differ from the current ones.
  const [loadedFor, setLoadedFor] = useState<Filters | null>(null);
  const loading = loadedFor !== filters;

  const apply = useCallback((data: Awaited<ReturnType<typeof fetchTransactions>>, forFilters: Filters) => {
    setTransactions(data.transactions);
    setTotal(data.total);
    setTotals({ spent: data.spent ?? 0, received: data.received ?? 0 });
    setLoadedFor(forFilters);
  }, []);
  const load = () => fetchTransactions(filters).then((d) => apply(d, filters));

  // State is set when the data arrives, not during the effect itself. A stale response is ignored.
  useEffect(() => {
    let alive = true;
    fetchTransactions(filters).then((d) => { if (alive) apply(d, filters); });
    return () => { alive = false; };
  }, [filters, apply]);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "n") { e.preventDefault(); setEditing(undefined); setModalMode("new"); }
      if (e.key === "i") { e.preventDefault(); setModalMode("csv"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this transaction?")) return;
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setTotal((prev) => prev - 1);
  }

  function onSave(tx: Transaction) {
    setTransactions((prev) => {
      const idx = prev.findIndex((t) => t.id === tx.id);
      return idx >= 0 ? prev.map((t) => (t.id === tx.id ? tx : t)) : [tx, ...prev];
    });
    setModalMode(null);
  }

  async function handleCategoryChange(id: string, category: string) {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, category } : t)));
    await fetch(`/api/transactions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
  }

  function onImportComplete(imported: number) {
    setModalMode(null);
    if (imported > 0) load();
  }

  const noAccounts = accounts.length === 0;

  return (
    <div className="px-4 py-6 lg:px-8 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Transactions</h1>
          <Link href="/settings/rules" className="text-xs text-violet-400 hover:text-violet-300">Review uncategorized →</Link>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setModalMode("csv")}
            disabled={noAccounts}
          >
            Import CSV
            <span className="hidden sm:inline text-xs opacity-60">⌘I</span>
          </Button>
          <Button
            onClick={() => { setEditing(undefined); setModalMode("new"); }}
            disabled={noAccounts}
          >
            + New
            <span className="hidden sm:inline text-xs opacity-60">⌘N</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          className="flex-1"
          placeholder="Search merchant or notes…"
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
        />
        <Select
          value={filters.accountId}
          onChange={(e) => setFilters((p) => ({ ...p, accountId: e.target.value }))}
          className="sm:w-40"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select
          value={filters.category}
          onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
          className="sm:w-40"
        >
          <option value="">All categories</option>
          {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 -mt-2">
        <Select
          aria-label="Period"
          value={filters.period}
          onChange={(e) => {
            const period = e.target.value as PeriodKey;
            // Custom keeps the current dates as a starting point to edit.
            setFilters((p) => (period === "custom" ? { ...p, period } : { ...p, period, ...periodRange(period) }));
          }}
          className="sm:w-44"
        >
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
        {filters.period === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
              className="[color-scheme:dark]"
            />
            <span className="text-zinc-500 text-sm">to</span>
            <Input
              type="date"
              aria-label="To"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
              className="[color-scheme:dark]"
            />
          </div>
        )}
        {filters.period !== "all" && filters.period !== "custom" && (filters.from || filters.to) && (
          <span className="text-xs text-zinc-500">{rangeLabel(filters.from, filters.to)}</span>
        )}
      </div>

      {filters.excludeTransfers && (
        <div className="flex flex-wrap gap-2 -mt-2">
          {filters.excludeTransfers && (
            <button
              onClick={() => setFilters((p) => ({ ...p, excludeTransfers: false }))}
              className="text-xs rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-300 hover:bg-zinc-700"
            >
              Transfers hidden ×
            </button>
          )}
        </div>
      )}

      <Card padding={false} className="overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm text-zinc-400">{total} transactions</span>
          {(filters.category || filters.from || filters.to) && (
            <span className="text-sm font-medium tabular-nums text-zinc-100">
              {totals.spent > 0 && `${formatCurrency(totals.spent)} spent`}
              {totals.received > 0 && (
                <span className="text-emerald-400">
                  {totals.spent > 0 ? " · " : ""}
                  {formatCurrency(totals.received)} {filters.category === "Income" ? "received" : filters.category ? "refunded" : "in"}
                </span>
              )}
              {total > 50 && <span className="text-xs text-zinc-500 font-normal"> · showing latest 50</span>}
            </span>
          )}
        </div>
        <div className="px-5">
          {loading ? (
            <div className="space-y-3 py-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <TransactionList
              transactions={transactions}
              onEdit={(tx) => { setEditing(tx); setModalMode("edit"); }}
              onDelete={handleDelete}
              onCategoryChange={handleCategoryChange}
            />
          )}
        </div>
      </Card>

      {/* New / Edit transaction */}
      <Modal
        open={modalMode === "new" || modalMode === "edit"}
        onClose={() => setModalMode(null)}
        title={modalMode === "edit" ? "Edit Transaction" : "New Transaction"}
      >
        <TransactionForm
          accounts={accounts}
          initial={editing}
          onSave={onSave}
          onCancel={() => setModalMode(null)}
        />
      </Modal>

      {/* CSV importer — wider modal */}
      <Modal
        open={modalMode === "csv"}
        onClose={() => setModalMode(null)}
        title="Import CSV"
        className="max-w-xl"
      >
        {accounts.length > 0 && (
          <CsvImporter
            accounts={accounts}
            onComplete={onImportComplete}
            onCancel={() => setModalMode(null)}
          />
        )}
      </Modal>
    </div>
  );
}
