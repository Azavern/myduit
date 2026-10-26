import { describe, expect, it } from "vitest";

import {
  formatIDR,
  formatQuantity,
  isValidQuantity,
  lineGross,
  MAX_IDR,
  normalizeQuantity,
  parseIDRInput,
  parseIDRInputAllowZero,
  percentDiscount,
} from "@/lib/money";

describe("lineGross", () => {
  it("rounds half-up to whole rupiah", () => {
    expect(lineGross("3", "1000.5")).toBe(3002n);
    expect(lineGross("1.5", "3333")).toBe(5000n);
  });

  it("is exact for values that break binary floating point", () => {
    expect(lineGross("0.1", "3")).toBe(0n);
    expect(lineGross("10", "0.1")).toBe(1n);
    expect(lineGross("7", "19.99")).toBe(140n);
  });
});

describe("percentDiscount", () => {
  it("computes basis points with half-up rounding", () => {
    expect(percentDiscount(100_000n, 250)).toBe(2500n);
    expect(percentDiscount(333n, 1000)).toBe(33n);
    expect(percentDiscount(335n, 1000)).toBe(34n);
  });
});

describe("formatIDR", () => {
  it("formats whole rupiah without decimals", () => {
    expect(formatIDR(0n)).toMatch(/^Rp\s?0$/);
    expect(formatIDR("1500000")).toMatch(/1\.500\.000/);
  });

  it("tolerates numeric strings returned by PostgreSQL", () => {
    expect(formatIDR("1234.00")).toMatch(/1\.234/);
  });
});

describe("parseIDRInput", () => {
  it("accepts formatted input and rejects invalid amounts", () => {
    expect(parseIDRInput("Rp 1.500.000")).toBe(1_500_000n);
    expect(parseIDRInput("0")).toBeNull();
    expect(parseIDRInput("-5")).toBeNull();
    expect(parseIDRInput("abc")).toBeNull();
    expect(parseIDRInput("")).toBeNull();
    expect(parseIDRInput(String(MAX_IDR + 1n))).toBeNull();
  });

  it("allows zero only in the permissive variant", () => {
    expect(parseIDRInputAllowZero("0")).toBe(0n);
    expect(parseIDRInputAllowZero("")).toBe(0n);
    expect(parseIDRInput("0")).toBeNull();
  });
});

describe("quantity helpers", () => {
  it("validates and normalises decimal quantities", () => {
    expect(isValidQuantity("1,5")).toBe(true);
    expect(isValidQuantity("0")).toBe(false);
    expect(isValidQuantity("-2")).toBe(false);
    expect(normalizeQuantity("1,5")).toBe("1.5");
    expect(formatQuantity("2.000000")).toBe("2");
  });
});
