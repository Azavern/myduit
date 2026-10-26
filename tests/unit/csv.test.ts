import { describe, expect, it } from "vitest";

import { csvFileName, sanitizeCsvCell, toCsv } from "@/lib/csv";

describe("sanitizeCsvCell", () => {
  it("neutralises spreadsheet formula injection", () => {
    expect(sanitizeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(sanitizeCsvCell("+1")).toBe("'+1");
    expect(sanitizeCsvCell("-1")).toBe("'-1");
    expect(sanitizeCsvCell("@cmd")).toBe("'@cmd");
    expect(sanitizeCsvCell("  =1+1")).toBe("'  =1+1");
  });

  it("leaves ordinary text untouched", () => {
    expect(sanitizeCsvCell("Toko Sinar")).toBe("Toko Sinar");
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("emits a header row, a BOM and escapes separators", () => {
    const csv = toCsv(
      [{ number: "INV-1", customer: "Toko, Jaya", amount: "1500" }],
      [
        { header: "Nomor", value: (row) => row.number },
        { header: "Pelanggan", value: (row) => row.customer },
        { header: "Nominal", value: (row) => row.amount, raw: true },
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Nomor,Pelanggan,Nominal");
    expect(csv).toContain('"Toko, Jaya"');
    expect(csv).toContain("1500");
  });
});

describe("csvFileName", () => {
  it("produces a safe, deterministic file name", () => {
    expect(csvFileName("Laporan Sales!", "2026-01-01_2026-01-31")).toBe("laporan-sales-2026-01-01_2026-01-31.csv");
  });
});
