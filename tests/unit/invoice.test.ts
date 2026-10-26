import { describe, expect, it } from "vitest";

import { calcInvoiceTotals, calcLine, paymentStatus, paymentStatusLabel } from "@/lib/invoice";

const noDiscount = { discountKind: "none" as const, discountAmount: "", discountBasisPoints: 0, additionalFee: "" };

describe("calcLine", () => {
  it("applies a fixed amount discount and clamps it to the gross", () => {
    const line = calcLine({ quantity: "2", unitPrice: "50000", discountKind: "amount", discountAmount: "15000", discountBasisPoints: 0 });
    expect(line).toEqual({ gross: 100_000n, discount: 15_000n, subtotal: 85_000n });

    const clamped = calcLine({ quantity: "1", unitPrice: "1000", discountKind: "amount", discountAmount: "9999", discountBasisPoints: 0 });
    expect(clamped.discount).toBe(1000n);
    expect(clamped.subtotal).toBe(0n);
  });

  it("applies a percentage discount on the line gross", () => {
    const line = calcLine({ quantity: "3", unitPrice: "10000", discountKind: "percent", discountAmount: "", discountBasisPoints: 1000 });
    expect(line.discount).toBe(3000n);
    expect(line.subtotal).toBe(27_000n);
  });
});

describe("calcInvoiceTotals", () => {
  it("discounts the subtotal after line discounts and adds the fee", () => {
    const lines = [calcLine({ quantity: "1", unitPrice: "100000", ...noDiscount })];
    const totals = calcInvoiceTotals(lines, {
      discountKind: "percent",
      discountAmount: "",
      discountBasisPoints: 1000,
      additionalFee: "5000",
    });
    expect(totals.subtotal).toBe(100_000n);
    expect(totals.discountAmount).toBe(10_000n);
    expect(totals.additionalFee).toBe(5000n);
    expect(totals.total).toBe(95_000n);
  });

  it("never produces a negative total", () => {
    const lines = [calcLine({ quantity: "1", unitPrice: "1000", ...noDiscount })];
    const totals = calcInvoiceTotals(lines, {
      discountKind: "amount",
      discountAmount: "5000",
      discountBasisPoints: 0,
      additionalFee: "0",
    });
    expect(totals.total).toBe(0n);
  });
});

describe("paymentStatus", () => {
  it("derives draft/unpaid/partial/paid/void", () => {
    expect(paymentStatus("draft", 100n, 0n, false)).toBe("draft");
    expect(paymentStatus("final", 100n, 0n, false)).toBe("unpaid");
    expect(paymentStatus("final", 100n, 40n, false)).toBe("partial");
    expect(paymentStatus("final", 100n, 100n, false)).toBe("paid");
    expect(paymentStatus("final", 100n, 100n, true)).toBe("void");
  });

  it("labels every status", () => {
    for (const status of ["draft", "unpaid", "partial", "paid", "void"] as const) {
      expect(paymentStatusLabel(status)).toBeTruthy();
    }
  });
});
