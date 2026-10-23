export type FieldKey = "date" | "merchant" | "amount" | "category" | "notes" | "skip";

export interface ColumnMapping {
  [csvHeader: string]: FieldKey;
}

export interface ParsedRow {
  date: string;
  merchant: string;
  amount: number;
  category?: string;
  notes?: string;
}

// Known institution presets
export interface InstitutionPreset {
  id: string;
  label: string;
  mapping: ColumnMapping;
  dateFormat?: string;
}

export const INSTITUTION_PRESETS: InstitutionPreset[] = [
  {
    id: "chase",
    label: "Chase",
    mapping: {
      "Details": "skip",
      "Posting Date": "date",
      "Description": "merchant",
      "Amount": "amount",
      "Type": "skip",
      "Balance": "skip",
      "Check or Slip #": "skip",
    },
  },
  {
    id: "robinhood",
    label: "Robinhood",
    mapping: {
      "Activity Date": "date",
      "Process Date": "skip",
      "Settle Date": "skip",
      "Instrument": "skip",
      "Description": "merchant",
      "Trans Code": "skip",
      "Quantity": "skip",
      "Price": "skip",
      "Amount": "amount",
    },
  },
];

export function detectPreset(headers: string[]): InstitutionPreset | null {
  for (const preset of INSTITUTION_PRESETS) {
    const presetKeys = Object.keys(preset.mapping);
    const matches = presetKeys.filter((k) => headers.includes(k)).length;
    if (matches >= Math.min(presetKeys.length, 3)) return preset;
  }
  return null;
}

export function parseRows(
  data: Record<string, string>[],
  mapping: ColumnMapping
): ParsedRow[] {
  const result: ParsedRow[] = [];

  for (const row of data) {
    const mapped: Partial<ParsedRow> & { amount?: number | string } = {};

    for (const [header, field] of Object.entries(mapping)) {
      if (field === "skip") continue;
      const value = row[header]?.trim() ?? "";
      if (!value) continue;

      if (field === "amount") {
        // Strip currency symbols and commas
        const cleaned = value.replace(/[$,\s]/g, "");
        const num = parseFloat(cleaned);
        if (!isNaN(num)) mapped.amount = num;
      } else if (field === "date") {
        mapped.date = normaliseDate(value);
      } else if (field === "merchant") {
        mapped.merchant = value;
      } else if (field === "category") {
        mapped.category = value;
      } else if (field === "notes") {
        mapped.notes = value;
      }
    }

    if (!mapped.date || !mapped.merchant || mapped.amount === undefined) continue;

    result.push({
      date: mapped.date,
      merchant: mapped.merchant,
      amount: mapped.amount as number,
      category: mapped.category,
      notes: mapped.notes,
    });
  }

  return result;
}

function normaliseDate(raw: string): string {
  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // MM/DD/YYYY
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;

  // Try native Date parse as last resort
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return raw;
}
