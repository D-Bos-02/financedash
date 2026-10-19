"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import Link from "next/link";
import { BackupCard } from "@/components/settings/BackupCard";
import { HouseholdSettings } from "@/components/settings/HouseholdSettings";
import { AssistantSettings } from "@/components/settings/AssistantSettings";
import { COMMON_CURRENCIES as CURRENCIES } from "@/lib/household";

interface FxRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}

export default function SettingsPage() {
  // FX rates
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [fxForm, setFxForm] = useState({ fromCurrency: "EUR", toCurrency: "USD", rate: "" });
  const [addingFx, setAddingFx] = useState(false);
  const [fxError, setFxError] = useState("");

  // Export / Import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/fx-rates")
      .then((r) => r.json())
      .then(setFxRates)
      .catch(() => {});
  }, []);

  async function addFxRate(e: React.FormEvent) {
    e.preventDefault();
    setFxError("");
    const rate = parseFloat(fxForm.rate);
    if (isNaN(rate) || rate <= 0) { setFxError("Rate must be a positive number"); return; }
    if (fxForm.fromCurrency === fxForm.toCurrency) { setFxError("Currencies must differ"); return; }
    setAddingFx(true);
    const res = await fetch("/api/fx-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromCurrency: fxForm.fromCurrency, toCurrency: fxForm.toCurrency, rate }),
    });
    const newRate: FxRate = await res.json();
    setFxRates((prev) => {
      const idx = prev.findIndex((r) => r.fromCurrency === newRate.fromCurrency && r.toCurrency === newRate.toCurrency);
      return idx >= 0 ? prev.map((r, i) => i === idx ? newRate : r) : [...prev, newRate];
    });
    setFxForm((p) => ({ ...p, rate: "" }));
    setAddingFx(false);
  }

  async function deleteFxRate(id: string) {
    await fetch(`/api/fx-rates/${id}`, { method: "DELETE" });
    setFxRates((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult("");
    try {
      const text = await file.text();
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json();
      if (data.error) {
        setImportResult(`Error: ${data.error}`);
      } else {
        const { imported } = data;
        setImportResult(
          `Imported: ${imported.accounts} accounts, ${imported.transactions} transactions, ` +
          `${imported.budgets} budgets, ${imported.categoryRules} rules, ${imported.fxRates} FX rates.`
        );
      }
    } catch {
      setImportResult("Failed to read file.");
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-zinc-100">Settings</h1>

      <HouseholdSettings />

      <AssistantSettings />

      {/* FX Rates */}
      <Card>
        <CardHeader><CardTitle>FX Rates</CardTitle></CardHeader>
        <div className="space-y-4">
          {fxRates.length > 0 && (
            <div className="divide-y divide-zinc-800">
              {fxRates.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 group">
                  <span className="text-sm text-zinc-300 tabular-nums">
                    1 <span className="text-zinc-500">{r.fromCurrency}</span>
                    {" = "}
                    <span className="font-semibold text-zinc-100">{r.rate}</span>
                    {" "}<span className="text-zinc-500">{r.toCurrency}</span>
                  </span>
                  <button
                    onClick={() => deleteFxRate(r.id)}
                    className="text-zinc-600 hover:text-red-400 text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={addFxRate} className="space-y-3 pt-1">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Add / update rate</p>
            <div className="grid grid-cols-3 gap-3">
              <Select
                label="From"
                value={fxForm.fromCurrency}
                onChange={(e) => setFxForm((p) => ({ ...p, fromCurrency: e.target.value }))}
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select
                label="To"
                value={fxForm.toCurrency}
                onChange={(e) => setFxForm((p) => ({ ...p, toCurrency: e.target.value }))}
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Input
                label="Rate"
                type="number"
                step="0.0001"
                min="0"
                value={fxForm.rate}
                onChange={(e) => setFxForm((p) => ({ ...p, rate: e.target.value }))}
                placeholder="1.0800"
                required
              />
            </div>
            {fxError && <p className="text-xs text-red-400">{fxError}</p>}
            <Button type="submit" variant="secondary" disabled={addingFx}>
              {addingFx ? "Saving…" : "Add Rate"}
            </Button>
          </form>
          <p className="text-xs text-zinc-600">
            Example: From EUR → To USD at 1.08 means 1 EUR = 1.08 USD.
          </p>
        </div>
      </Card>

      {/* Category Rules */}
      <Card>
        <CardHeader><CardTitle>Category Rules</CardTitle></CardHeader>
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Auto-categorise transactions on import and manual entry using pattern-matching rules.
          </p>
          <Link href="/settings/rules">
            <Button variant="secondary">Manage Rules →</Button>
          </Link>
        </div>
      </Card>

      {/* Data */}
      <BackupCard />

      <Card>
        <CardHeader><CardTitle>Data</CardTitle></CardHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-300">Export</p>
            <p className="text-xs text-zinc-500">
              Download all your accounts, transactions, budgets, rules, and settings as a JSON backup.
            </p>
            {/* A plain download link: the route sends the file as an attachment. */}
            <a
              href="/api/data/export"
              download
              className="inline-flex items-center gap-2 font-medium rounded-lg transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-4 py-2 text-sm"
            >
              Export JSON
            </a>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-2">
            <p className="text-sm font-medium text-zinc-300">Import</p>
            <p className="text-xs text-zinc-500">
              Restore from a previously exported JSON file. Existing records are preserved — duplicates are skipped.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer">
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition-colors">
                  {importing ? "Importing…" : "Choose file"}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  disabled={importing}
                  onChange={handleImport}
                />
              </label>
              {importResult && (
                <p className={`text-xs ${importResult.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                  {importResult}
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card>
        <CardHeader><CardTitle>About</CardTitle></CardHeader>
        <div className="text-sm text-zinc-400 space-y-1">
          <p>FinanceDash — self-hosted personal finance.</p>
          <p>All data is stored locally in SQLite. Nothing leaves your machine.</p>
        </div>
      </Card>
    </div>
  );
}
