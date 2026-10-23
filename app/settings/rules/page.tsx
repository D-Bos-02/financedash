"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { DEFAULT_CATEGORIES, MONEY_MOVEMENT } from "@/lib/categories";
import { formatCurrency } from "@/lib/formatters";
import Link from "next/link";
import { BASE_PATH } from "@/lib/demo/mode";

interface Rule {
  id: string;
  pattern: string;
  category: string;
  subCategory?: string | null;
  isTransfer: boolean;
  priority: number;
}

interface UncategorizedMerchant {
  merchant: string;
  count: number;
  spent: number;
}

function RuleForm({ initial, onSave, onCancel }: { initial?: string; onSave: (r: Rule) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ pattern: initial ?? "", category: "Food & Dining", priority: "0", isTransfer: false });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`${BASE_PATH}/api/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, priority: parseInt(form.priority) }),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label='Merchant pattern (case-insensitive "contains" match)'
        id="pattern"
        placeholder='e.g. "bakery" or "visa payment"'
        value={form.pattern}
        onChange={(e) => setForm((p) => ({ ...p, pattern: e.target.value }))}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} disabled={form.isTransfer}>
          {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input label="Priority" type="number" min="0" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
        <input type="checkbox" checked={form.isTransfer} onChange={(e) => setForm((p) => ({ ...p, isTransfer: e.target.checked }))} className="rounded accent-violet-500" />
        Mark as <span className="text-amber-400 font-medium">Transfer</span>
        <span className="text-zinc-600 text-xs">(excluded from P&L)</span>
      </label>
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={saving} className="flex-1">{saving ? "Saving…" : "Add Rule"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

async function fetchPage() {
  const [rules, uncat] = await Promise.all([`${BASE_PATH}/api/rules`, `${BASE_PATH}/api/transactions/uncategorized`].map((u) => fetch(u).then((r) => r.json())));
  return { rules, uncat };
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addingPattern, setAddingPattern] = useState<string | undefined>();

  const [uncategorized, setUncategorized] = useState<UncategorizedMerchant[]>([]);
  const [uncatTotal, setUncatTotal] = useState(0);
  const [uncatSpent, setUncatSpent] = useState(0);
  const [quickCats, setQuickCats] = useState<Record<string, string>>({});
  const [savingQuick, setSavingQuick] = useState<string | null>(null);

  const [reapplying, setReapplying] = useState(false);
  const [reapplyResult, setReapplyResult] = useState("");



  const apply = useCallback(({ rules, uncat }: Awaited<ReturnType<typeof fetchPage>>) => {
    setRules(rules);
    setUncategorized(uncat.merchants ?? []);
    setUncatTotal(uncat.total ?? 0);
    setUncatSpent(uncat.spent ?? 0);
    setLoading(false);
  }, []);
  // State is set when the data arrives, not during the effect itself.
  useEffect(() => { fetchPage().then(apply); }, [apply]);

  async function deleteRule(id: string) {
    await fetch(`${BASE_PATH}/api/rules/${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function reapplyRules() {
    setReapplying(true);
    setReapplyResult("");
    const res = await fetch(`${BASE_PATH}/api/transactions/recategorize`, { method: "POST" });
    const { updated, total } = await res.json();
    setReapplyResult(`Updated ${updated} of ${total} transactions.`);
    setReapplying(false);
    // Refresh uncategorized list
    await refreshUncategorized();
  }

  async function refreshUncategorized() {
    const uncatRes = await fetch(`${BASE_PATH}/api/transactions/uncategorized`);
    const uncatData = await uncatRes.json();
    setUncategorized(uncatData.merchants ?? []);
    setUncatTotal(uncatData.total ?? 0);
    setUncatSpent(uncatData.spent ?? 0);
  }

  // Creates the rule and applies it to past transactions straight away.
  async function saveQuickRule(merchant: string) {
    const choice = quickCats[merchant];
    if (!choice) return;
    const transfer = choice === "__transfer__";
    setSavingQuick(merchant);
    const res = await fetch(`${BASE_PATH}/api/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: merchant.toLowerCase(),
        category: transfer ? MONEY_MOVEMENT : choice,
        priority: 0,
        isTransfer: transfer,
      }),
    });
    const newRule = await res.json();
    setRules((prev) => [newRule, ...prev]);
    await fetch(`${BASE_PATH}/api/transactions/recategorize`, { method: "POST" });
    await refreshUncategorized();
    setSavingQuick(null);
  }

  const DEFAULT_RULES: Omit<Rule, "id">[] = [
    { pattern: "whole foods", category: "Food & Dining", priority: 0, isTransfer: false },
    { pattern: "trader joe", category: "Food & Dining", priority: 0, isTransfer: false },
    { pattern: "uber eats", category: "Food & Dining", priority: 0, isTransfer: false },
    { pattern: "doordash", category: "Food & Dining", priority: 0, isTransfer: false },
    { pattern: "netflix", category: "Subscriptions", priority: 0, isTransfer: false },
    { pattern: "spotify", category: "Subscriptions", priority: 0, isTransfer: false },
    { pattern: "amazon", category: "Shopping", priority: 0, isTransfer: false },
    { pattern: "uber", category: "Transport", priority: 0, isTransfer: false },
    { pattern: "lyft", category: "Transport", priority: 0, isTransfer: false },
    { pattern: "caltrain", category: "Transport", priority: 0, isTransfer: false },
    { pattern: "payroll", category: "Income", priority: 10, isTransfer: false },
    { pattern: "direct dep", category: "Income", priority: 10, isTransfer: false },
    { pattern: "payment - thank you", category: "Transfer", priority: 20, isTransfer: true },
    { pattern: "autopay payment", category: "Transfer", priority: 20, isTransfer: true },
    { pattern: "credit card payment", category: "Transfer", priority: 20, isTransfer: true },
    { pattern: "visa payment", category: "Transfer", priority: 20, isTransfer: true },
    { pattern: "mastercard payment", category: "Transfer", priority: 20, isTransfer: true },
    { pattern: "amex payment", category: "Transfer", priority: 20, isTransfer: true },
    { pattern: "online payment", category: "Transfer", priority: 15, isTransfer: true },
    { pattern: "transfer to", category: "Transfer", priority: 15, isTransfer: true },
    { pattern: "transfer from", category: "Transfer", priority: 15, isTransfer: true },
  ];

  async function seedDefaults() {
    for (const rule of DEFAULT_RULES) {
      const res = await fetch(`${BASE_PATH}/api/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      const r = await res.json();
      setRules((prev) => [...prev, r]);
    }
  }

  const categoryRules = rules.filter((r) => !r.isTransfer);
  const transferRules = rules.filter((r) => r.isTransfer);

  return (
    <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-zinc-500 hover:text-zinc-300 transition-colors">← Settings</Link>
        <span className="text-zinc-700">/</span>
        <h1 className="text-xl font-bold text-zinc-100">Category Rules</h1>
      </div>

      {/* Uncategorized merchants — shown first so it's the primary action */}
      {!loading && uncatTotal > 0 && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-sm font-medium text-zinc-100">Uncategorised merchants</span>
              <p className="text-xs text-zinc-500 mt-0.5">
                {uncatTotal} transactions ({formatCurrency(uncatSpent, "USD", true)}) still on &quot;Other&quot;, biggest first. Pick a category and
                save: it applies to past transactions and future syncs.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {reapplyResult && <span className="text-xs text-emerald-400">{reapplyResult}</span>}
              <Button size="sm" variant="secondary" onClick={reapplyRules} disabled={reapplying}>
                {reapplying ? "Re-applying…" : "Re-apply rules"}
              </Button>
            </div>
          </div>
          <div className="divide-y divide-zinc-800">
            {uncategorized.map((m) => (
              <div key={m.merchant} className="flex items-center gap-3 px-5 py-2.5 flex-wrap">
                <span className="flex-1 text-sm text-zinc-300 font-mono truncate min-w-0" title={m.merchant}>
                  {m.merchant}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums shrink-0">{formatCurrency(m.spent, "USD")}</span>
                <span className="text-xs text-zinc-600 shrink-0">{m.count}×</span>
                <select
                  value={quickCats[m.merchant] ?? ""}
                  onChange={(e) => setQuickCats((p) => ({ ...p, [m.merchant]: e.target.value }))}
                  className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md px-2 py-1 cursor-pointer shrink-0"
                >
                  <option value="" disabled>Choose…</option>
                  {DEFAULT_CATEGORIES.filter((c) => c !== MONEY_MOVEMENT && c !== "Other").map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__transfer__">Transfer between our accounts</option>
                </select>
                <button
                  onClick={() => saveQuickRule(m.merchant)}
                  disabled={savingQuick === m.merchant || !quickCats[m.merchant]}
                  className="text-xs px-2.5 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-md transition-colors cursor-pointer shrink-0"
                >
                  {savingQuick === m.merchant ? "…" : "Save"}
                </button>
              </div>
            ))}
          </div>
          {uncategorized.length === 0 && uncatTotal === 0 && (
            <p className="px-5 py-4 text-sm text-emerald-400">All transactions are categorised.</p>
          )}
        </Card>
      )}

      <p className="text-sm text-zinc-500">
        Rules auto-categorise transactions on import. Patterns are case-insensitive &ldquo;contains&rdquo; matches against the merchant name.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-zinc-800 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <>
          {rules.length === 0 && !adding && (
            <Card>
              <p className="text-sm text-zinc-500 mb-3">No rules yet.</p>
              <div className="flex gap-3">
                <Button onClick={() => { setAddingPattern(undefined); setAdding(true); }}>+ Add Rule</Button>
                <Button variant="secondary" onClick={seedDefaults}>Seed defaults</Button>
              </div>
            </Card>
          )}

          {transferRules.length > 0 && (
            <Card padding={false}>
              <div className="px-5 py-3 border-b border-zinc-800">
                <span className="text-sm font-medium text-amber-400">Transfer Rules</span>
                <p className="text-xs text-zinc-500 mt-0.5">Matched transactions are excluded from P&L</p>
              </div>
              <div className="divide-y divide-zinc-800">
                {transferRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-3 px-5 py-3 group">
                    <code className="flex-1 text-sm text-violet-300 font-mono">&ldquo;{rule.pattern}&rdquo;</code>
                    <Badge variant="amber">Transfer</Badge>
                    {rule.priority > 0 && <span className="text-xs text-zinc-500">p{rule.priority}</span>}
                    <button onClick={() => deleteRule(rule.id)} className="hidden group-hover:block text-zinc-600 hover:text-red-400 transition-colors cursor-pointer">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {categoryRules.length > 0 && (
            <Card padding={false}>
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm text-zinc-400">{categoryRules.length} category rules</span>
                <Button size="sm" onClick={() => { setAddingPattern(undefined); setAdding(true); }}>+ Add Rule</Button>
              </div>
              <div className="divide-y divide-zinc-800">
                {categoryRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-3 px-5 py-3 group">
                    <code className="flex-1 text-sm text-violet-300 font-mono">&ldquo;{rule.pattern}&rdquo;</code>
                    <svg className="w-4 h-4 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    <Badge>{rule.category}</Badge>
                    {rule.priority > 0 && <span className="text-xs text-zinc-500">p{rule.priority}</span>}
                    <button onClick={() => deleteRule(rule.id)} className="hidden group-hover:block text-zinc-600 hover:text-red-400 transition-colors cursor-pointer">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {rules.length > 0 && !adding && (
            <div className="flex gap-3">
              <Button onClick={() => { setAddingPattern(undefined); setAdding(true); }}>+ Add Rule</Button>
              <Button variant="secondary" onClick={seedDefaults}>Seed defaults</Button>
            </div>
          )}
        </>
      )}

      {adding && (
        <Card>
          <CardHeader><CardTitle>New Rule</CardTitle></CardHeader>
          <RuleForm
            initial={addingPattern}
            onSave={(r) => { setRules((prev) => [r, ...prev]); setAdding(false); setAddingPattern(undefined); }}
            onCancel={() => { setAdding(false); setAddingPattern(undefined); }}
          />
        </Card>
      )}
    </div>
  );
}
