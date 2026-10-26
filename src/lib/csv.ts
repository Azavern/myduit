import { stringify } from "csv-stringify/sync";

export const MAX_EXPORT_ROWS = 10_000;

/**
 * Neutralise spreadsheet formula injection for user-provided text fields.
 * Values starting with = + - @ (or tab/CR) after optional whitespace are
 * prefixed with an apostrophe so spreadsheets treat them as text.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
  /** Money/quantity columns are emitted verbatim (already formatted by caller). */
  raw?: boolean;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const data = rows.map((row) =>
    columns.map((column) => {
      const raw = column.value(row);
      return column.raw ? (raw === null || raw === undefined ? "" : String(raw)) : sanitizeCsvCell(raw);
    }),
  );
  return stringify(data, {
    header: true,
    columns: columns.map((c) => c.header),
    bom: true,
    record_delimiter: "windows",
  });
}

export function csvFileName(base: string, dateStamp: string): string {
  const safe = base
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe}-${dateStamp}.csv`;
}
