"use client";

import { Select } from "@/components/ui/Input";
import { COMMON_CURRENCIES, COMMON_LOCALES, type Profile } from "@/lib/household";

type Fields = Pick<Profile, "householdType" | "baseCurrency" | "timeZone" | "locale">;

// The browser's own settings, used as the starting point for a new profile.
export function browserDefaults(): Fields {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return { householdType: "solo", baseCurrency: "USD", timeZone: tz, locale: navigator.language || "en-US" };
}

const TIME_ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export function HouseholdTypeToggle({ value, onChange, disableSolo }: {
  value: Profile["householdType"];
  onChange: (v: Profile["householdType"]) => void;
  disableSolo?: boolean;
}) {
  const options = [
    { value: "solo" as const, label: "Just me", note: "One person's money" },
    { value: "household" as const, label: "A household", note: "Two or more people, some money shared" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((o) => {
        const disabled = o.value === "solo" && disableSolo;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            title={disabled ? "Remove the other people first" : undefined}
            className={`text-left rounded-xl border px-4 py-3 transition-colors disabled:opacity-40 ${
              value === o.value ? "border-violet-500 bg-violet-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            }`}
          >
            <p className="text-sm font-medium text-zinc-100">{o.label}</p>
            <p className="text-xs text-zinc-500">{o.note}</p>
          </button>
        );
      })}
    </div>
  );
}

// Currency, time zone and number format. Controlled: the caller decides when to save.
export function RegionFields({ value, onChange }: { value: Fields; onChange: (patch: Partial<Fields>) => void }) {
  const currencies = COMMON_CURRENCIES.includes(value.baseCurrency) ? COMMON_CURRENCIES : [value.baseCurrency, ...COMMON_CURRENCIES];
  const locales = COMMON_LOCALES.some((l) => l.value === value.locale) ? COMMON_LOCALES : [{ value: value.locale, label: value.locale }, ...COMMON_LOCALES];
  const zones = TIME_ZONES.includes(value.timeZone) ? TIME_ZONES : [value.timeZone, ...TIME_ZONES];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Select label="Currency" id="baseCurrency" value={value.baseCurrency} onChange={(e) => onChange({ baseCurrency: e.target.value })}>
        {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select label="Time zone" id="timeZone" value={value.timeZone} onChange={(e) => onChange({ timeZone: e.target.value })}>
        {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
      </Select>
      <Select label="Number format" id="locale" value={value.locale} onChange={(e) => onChange({ locale: e.target.value })}>
        {locales.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </Select>
    </div>
  );
}
