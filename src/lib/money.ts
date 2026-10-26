import Decimal from "decimal.js";

// All financial arithmetic goes through Decimal. Never use parseFloat or
// Number for money operations (blueprint §8). Rupiah is a whole number.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });

export const MAX_IDR = 1_000_000_000_000n; // Rp1.000.000.000.000 (idr_amount domain)

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Accepts a digit string, integer, or bigint and returns a Decimal. */
export function toDecimal(value: string | number | bigint): Decimal {
  return new Decimal(value.toString());
}

/** Half-up rounding to whole rupiah, returned as bigint. */
export function roundToRupiah(value: Decimal): bigint {
  return BigInt(value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/** Line gross amount = round(quantity * unitPrice) using half-up. */
export function lineGross(quantity: string, unitPrice: string): bigint {
  return roundToRupiah(toDecimal(quantity).times(toDecimal(unitPrice)));
}

/** Percentage discount = round(base * basisPoints / 10000). */
export function percentDiscount(base: bigint, basisPoints: number): bigint {
  return roundToRupiah(toDecimal(base.toString()).times(basisPoints).div(10000));
}

export type LineDiscountInput = {
  gross: bigint;
  discountKind: "none" | "amount" | "percent";
  discountAmount: string;
  discountBasisPoints: number;
};

export function lineDiscount(input: LineDiscountInput): bigint {
  if (input.discountKind === "none") return 0n;
  if (input.discountKind === "percent") {
    return percentDiscount(input.gross, input.discountBasisPoints);
  }
  return BigInt(input.discountAmount.replace(/\D/g, "") || "0");
}

export function formatIDR(value: string | number | bigint): string {
  const digits = typeof value === "string" ? value.split(".")[0] ?? "0" : value;
  return idrFormatter.format(BigInt(digits || "0")).replace(/\u00a0/g, " ");
}

/** Format a numeric column returned by PostgreSQL (qty, totals) as IDR. */
export function formatIDRFromNumeric(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return formatIDR(0);
  return formatIDR(Math.trunc(Number(value)).toString());
}

/**
 * Parse user input such as "1.500.000", "Rp 1 500 000" or "1500000" into a
 * whole-rupiah bigint. Returns null when the input is not a valid amount.
 */
export function parseIDRInput(input: string | null | undefined): bigint | null {
  if (input === null || input === undefined) return null;
  const cleaned = input.replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const value = BigInt(cleaned);
  if (value <= 0n || value > MAX_IDR) return null;
  return value;
}

/** Parse a non-negative amount (0 allowed), used for openings and credit limits. */
export function parseIDRInputAllowZero(input: string | null | undefined): bigint | null {
  if (input === null || input === undefined) return null;
  const cleaned = input.trim() === "" ? "0" : input.replace(/[^\d]/g, "");
  if (cleaned === "") return null;
  const value = BigInt(cleaned);
  if (value < 0n || value > MAX_IDR) return null;
  return value;
}

export function formatQuantity(value: string | number): string {
  const decimal = toDecimal(value);
  if (decimal.isInteger()) return decimal.toFixed(0);
  return decimal.toDecimalPlaces(6).toString().replace(/\.?0+$/, "");
}

export function isValidQuantity(value: string): boolean {
  const cleaned = value.replace(",", ".").trim();
  if (cleaned === "") return false;
  try {
    const decimal = new Decimal(cleaned);
    return decimal.isFinite() && decimal.greaterThan(0) && decimal.lessThan(1_000_000_000_000);
  } catch {
    return false;
  }
}

export function normalizeQuantity(value: string): string {
  return new Decimal(value.replace(",", ".").trim()).toDecimalPlaces(6).toString();
}
