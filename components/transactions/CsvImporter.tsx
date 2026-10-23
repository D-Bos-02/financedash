"use client";

import { useState, useRef, DragEvent } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  INSTITUTION_PRESETS,
  detectPreset,
  type ColumnMapping,
  type FieldKey,
  type ParsedRow,
  parseRows,
} from "@/lib/csv-parser";
import { Account } from "@/types";
import { BASE_PATH } from "@/lib/demo/mode";

type Stage = "upload" | "mapping" | "preview";

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: "skip", label: "Skip" },
  { value: "date", label: "Date *" },
  { value: "merchant", label: "Merchant / Description *" },
  { value: "amount", label: "Amount *" },
  { value: "category", label: "Category" },
  { value: "notes", label: "Notes" },
];

interface CsvImporterProps {
  accounts: Account[];
  onComplete: (imported: number) => void;
  onCancel: () => void;
}

export function CsvImporter({ accounts, onComplete, onCancel }: CsvImporterProps) {
  const [stage, setStage] = useState<Stage>("upload");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError("");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data.length) {
          setError("No data rows found in this file.");
          return;
        }
        const h = results.meta.fields ?? [];
        const detected = detectPreset(h);
        const initialMapping: ColumnMapping = {};
        for (const header of h) {
          initialMapping[header] = detected?.mapping[header] ?? "skip";
        }
        setHeaders(h);
        setRawRows(results.data);
        setMapping(initialMapping);
        setStage("mapping");
      },
      error: () => setError("Failed to parse CSV. Make sure it is a valid UTF-8 file."),
    });
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function applyPreset(id: string) {
    const preset = INSTITUTION_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const m = { ...mapping };
    for (const h of headers) {
      m[h] = preset.mapping[h] ?? "skip";
    }
    setMapping(m);
  }

  function setField(header: string, value: FieldKey) {
    setMapping((prev) => ({ ...prev, [header]: value }));
  }

  function goToPreview() {
    const parsed = parseRows(rawRows, mapping);
    if (!parsed.length) {
      setError("No valid rows after mapping. Make sure Date, Merchant, and Amount are mapped.");
      return;
    }
    setPreviewRows(parsed.slice(0, 10));
    setError("");
    setStage("preview");
  }

  async function doImport() {
    setImporting(true);
    setError("");
    try {
      const res = await fetch(`${BASE_PATH}/api/transactions/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, rows: rawRows, mapping }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult(data);
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  const requiredMapped = ["date", "merchant", "amount"] as FieldKey[];
  const mappedFields = Object.values(mapping);
  const missingRequired = requiredMapped.filter((f) => !mappedFields.includes(f));

  // ── Stage: upload ──────────────────────────────────────────────────────────
  if (stage === "upload") {
    return (
      <div className="space-y-5">
        <Select
          label="Import into account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </Select>

        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? "border-violet-500 bg-violet-500/10" : "border-zinc-700 hover:border-zinc-500"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileInput} />
          <svg className="w-10 h-10 mx-auto mb-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-zinc-300 font-medium">Drop a CSV file here, or click to browse</p>
          <p className="text-xs text-zinc-500 mt-1">Chase, Robinhood, and generic formats supported</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button variant="secondary" onClick={onCancel} className="w-full">Cancel</Button>
      </div>
    );
  }

  // ── Stage: mapping ─────────────────────────────────────────────────────────
  if (stage === "mapping") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">{rawRows.length} rows detected</p>
          <div className="flex gap-2">
            {INSTITUTION_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {headers.map((header) => (
            <div key={header} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-zinc-300 truncate font-mono bg-zinc-800 px-2 py-1.5 rounded">
                {header}
              </span>
              <svg className="w-4 h-4 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <Select
                value={mapping[header] ?? "skip"}
                onChange={(e) => setField(header, e.target.value as FieldKey)}
                className="w-48"
              >
                {FIELD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>

        {missingRequired.length > 0 && (
          <p className="text-xs text-amber-400">
            Still need to map: {missingRequired.join(", ")}
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button onClick={goToPreview} disabled={missingRequired.length > 0} className="flex-1">
            Preview →
          </Button>
          <Button variant="secondary" onClick={() => setStage("upload")}>Back</Button>
        </div>
      </div>
    );
  }

  // ── Stage: preview ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="text-5xl">✓</div>
        <div>
          <p className="text-lg font-semibold text-zinc-100">Import complete</p>
          <p className="text-sm text-zinc-400 mt-1">
            {result.imported} imported · {result.skipped} duplicates skipped
          </p>
        </div>
        <Button onClick={() => onComplete(result.imported)} className="w-full">Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">Preview — first 10 rows</p>
        <Badge variant="blue">{rawRows.length} total rows</Badge>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="px-3 py-2 text-left text-zinc-500 font-medium">Date</th>
              <th className="px-3 py-2 text-left text-zinc-500 font-medium">Merchant</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-medium">Amount</th>
              <th className="px-3 py-2 text-left text-zinc-500 font-medium">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {previewRows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-800/50">
                <td className="px-3 py-2 text-zinc-400">{row.date}</td>
                <td className="px-3 py-2 text-zinc-200 truncate max-w-32">{row.merchant}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {row.amount >= 0 ? "+" : ""}{row.amount.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-zinc-500">{row.category ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3 pt-1">
        <Button onClick={doImport} disabled={importing} className="flex-1">
          {importing ? "Importing…" : `Import ${rawRows.length} rows`}
        </Button>
        <Button variant="secondary" onClick={() => setStage("mapping")}>Back</Button>
      </div>
    </div>
  );
}
