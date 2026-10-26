export const DEFAULT_TIMEZONE = "Asia/Makassar";

/** Today's date in the workspace timezone, as YYYY-MM-DD. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDateID(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  const [year, month, day] = dateString.slice(0, 10).split("-");
  if (!year || !month || !day) return dateString;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return `${Number(day)} ${months[Number(month) - 1] ?? month} ${year}`;
}

export function formatDateTimeID(value: string | Date | null | undefined, timezone = DEFAULT_TIMEZONE): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export const AGING_BUCKETS = [
  { key: "not_due", label: "Belum jatuh tempo" },
  { key: "d1_30", label: "Terlambat 1–30 hari" },
  { key: "d31_60", label: "Terlambat 31–60 hari" },
  { key: "d61_90", label: "Terlambat 61–90 hari" },
  { key: "d90_plus", label: "Terlambat > 90 hari" },
] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucket(dueDate: string | null, cutoff: string): AgingBucket {
  if (!dueDate) return "not_due";
  const overdue = daysBetween(dueDate, cutoff);
  if (overdue <= 0) return "not_due";
  if (overdue <= 30) return "d1_30";
  if (overdue <= 60) return "d31_60";
  if (overdue <= 90) return "d61_90";
  return "d90_plus";
}

export const PERIOD_PRESETS = [
  { key: "today", label: "Hari ini" },
  { key: "7d", label: "7 hari terakhir" },
  { key: "this_month", label: "Bulan ini" },
  { key: "last_month", label: "Bulan lalu" },
  { key: "this_quarter", label: "Kuartal ini" },
  { key: "this_year", label: "Tahun ini" },
  { key: "custom", label: "Rentang khusus" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];

export type DateRange = { from: string; to: string; label: string };

export function resolvePeriod(
  preset: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined,
  timezone: string,
): DateRange {
  const today = todayInTimezone(timezone);
  const presetKeys = PERIOD_PRESETS.map((p) => p.key) as string[];
  const selected = preset && presetKeys.includes(preset) ? preset : "this_month";
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];

  switch (selected) {
    case "today":
      return { from: today, to: today, label: "Hari ini" };
    case "7d":
      return { from: addDays(today, -6), to: today, label: "7 hari terakhir" };
    case "last_month": {
      const firstThisMonth = `${today.slice(0, 7)}-01`;
      const lastPrevMonth = addDays(firstThisMonth, -1);
      return { from: `${lastPrevMonth.slice(0, 7)}-01`, to: lastPrevMonth, label: "Bulan lalu" };
    }
    case "this_quarter": {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return {
        from: `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`,
        to: today,
        label: "Kuartal ini",
      };
    }
    case "this_year":
      return { from: `${year}-01-01`, to: today, label: "Tahun ini" };
    case "custom": {
      const from = fromParam && isValidDateString(fromParam) ? fromParam : `${today.slice(0, 7)}-01`;
      const to = toParam && isValidDateString(toParam) ? toParam : today;
      return from <= to
        ? { from, to, label: `${formatDateID(from)} – ${formatDateID(to)}` }
        : { from: to, to: from, label: `${formatDateID(to)} – ${formatDateID(from)}` };
    }
    case "this_month":
    default:
      return { from: `${today.slice(0, 7)}-01`, to: today, label: "Bulan ini" };
  }
}
