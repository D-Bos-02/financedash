import { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">{children}</h2>;
}

export function NumField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  note,
  slider,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  note?: ReactNode;
  slider?: { min: number; max: number; step: number };
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-sm text-zinc-500">{prefix}</span>}
        <input
          type="number"
          value={value}
          step={step}
          min={0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-violet-500 transition-colors"
        />
        {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
      </div>
      {slider && (
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full mt-3 accent-violet-500 cursor-pointer"
        />
      )}
      {note && <p className="text-[11px] text-zinc-500 mt-1.5">{note}</p>}
    </div>
  );
}

export function SliderCard({
  label,
  display,
  sub,
  value,
  onChange,
  min,
  max,
  step = 1,
  ticks,
  accent = "text-violet-400",
}: {
  label: string;
  display: string;
  sub: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  ticks: [string, string, string];
  accent?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex justify-between items-baseline mb-0.5">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${accent}`}>{display}</span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-3">{sub}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-zinc-600 mt-1 tabular-nums">
        {ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "text-zinc-100",
  size = "text-xl",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
  size?: string;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className={`${size} font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Row({ label, value, tone = "text-zinc-100", bold }: { label: string; value: ReactNode; tone?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-3 py-2 border-b border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`text-sm tabular-nums ${tone} ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

export function tone(positive: boolean) {
  return positive ? "text-emerald-400" : "text-red-400";
}
