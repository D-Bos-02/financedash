export function formatCurrency(
  amount: number,
  currency = "USD",
  compact = false
): string {
  const opts: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  if (compact && Math.abs(amount) >= 1000) {
    opts.notation = "compact";
    opts.minimumFractionDigits = 0;
    opts.maximumFractionDigits = 1;
  }
  return new Intl.NumberFormat("en-US", opts).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatMonth(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
  }).format(new Date(date));
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function monthsAgo(n: number, from = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() - n, 1);
}

// Calendar month as a UTC date range. Transactions are stored at UTC midnight, so month
// boundaries must be UTC too, or the 1st of each month lands in the previous month.
export function monthRangeUtc(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1) - 1) };
}

export function currentMonthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}
