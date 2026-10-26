import { describe, expect, it } from "vitest";

import { addDays, agingBucket, daysBetween, isValidDateString, resolvePeriod, todayInTimezone } from "@/lib/dates";

describe("todayInTimezone", () => {
  it("uses the workspace timezone rather than UTC", () => {
    const instant = new Date("2026-01-31T17:30:00Z"); // 01 Feb 01:30 in Asia/Makassar
    expect(todayInTimezone("Asia/Makassar", instant)).toBe("2026-02-01");
    expect(todayInTimezone("UTC", instant)).toBe("2026-01-31");
  });
});

describe("isValidDateString", () => {
  it("rejects impossible calendar dates", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026/02/01")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("addDays / daysBetween", () => {
  it("moves across month boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });
});

describe("resolvePeriod", () => {
  it("defaults to the current month in the workspace timezone", () => {
    const range = resolvePeriod(undefined, undefined, undefined, "UTC");
    const today = todayInTimezone("UTC");
    expect(range.to).toBe(today);
    expect(range.from).toBe(`${today.slice(0, 7)}-01`);
  });

  it("normalises an inverted custom range and ignores invalid dates", () => {
    const inverted = resolvePeriod("custom", "2026-05-10", "2026-05-01", "UTC");
    expect(inverted.from).toBe("2026-05-01");
    expect(inverted.to).toBe("2026-05-10");
    const fallback = resolvePeriod("custom", "nope", "2026-13-01", "UTC");
    expect(isValidDateString(fallback.from)).toBe(true);
    expect(isValidDateString(fallback.to)).toBe(true);
  });

  it("falls back to this_month for an unknown preset", () => {
    expect(resolvePeriod("bogus", undefined, undefined, "UTC").label).toBe("Bulan ini");
  });
});

describe("agingBucket", () => {
  it("classifies overdue invoices into the documented buckets", () => {
    expect(agingBucket(null, "2026-06-01")).toBe("not_due");
    expect(agingBucket("2026-06-01", "2026-06-01")).toBe("not_due");
    expect(agingBucket("2026-05-31", "2026-06-01")).toBe("d1_30");
    expect(agingBucket("2026-05-01", "2026-06-01")).toBe("d31_60");
    expect(agingBucket("2026-03-15", "2026-06-01")).toBe("d61_90");
    expect(agingBucket("2025-01-01", "2026-06-01")).toBe("d90_plus");
  });
});
