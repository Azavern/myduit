import { lineDiscount, lineGross, percentDiscount } from "@/lib/money";

export type DiscountKind = "none" | "amount" | "percent";

export type LineCalcInput = {
  quantity: string;
  unitPrice: string;
  discountKind: DiscountKind;
  discountAmount: string;
  discountBasisPoints: number;
};

export type LineCalc = { gross: bigint; discount: bigint; subtotal: bigint };

export function calcLine(input: LineCalcInput): LineCalc {
  const gross = lineGross(input.quantity, input.unitPrice);
  const discount = lineDiscount({
    gross,
    discountKind: input.discountKind,
    discountAmount: input.discountAmount,
    discountBasisPoints: input.discountBasisPoints,
  });
  const clamped = discount > gross ? gross : discount;
  return { gross, discount: clamped, subtotal: gross - clamped };
}

export type InvoiceDiscountInput = {
  discountKind: DiscountKind;
  discountAmount: string;
  discountBasisPoints: number;
  additionalFee: string;
};

export type InvoiceTotals = {
  subtotal: bigint;
  discountAmount: bigint;
  additionalFee: bigint;
  total: bigint;
};

/**
 * Invoice discount applies to the subtotal after line discounts; the
 * additional fee is added afterwards. Matches the database CHECK constraints.
 */
export function calcInvoiceTotals(lines: LineCalc[], discount: InvoiceDiscountInput): InvoiceTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0n);
  let discountAmount = 0n;
  if (discount.discountKind === "percent") {
    discountAmount = percentDiscount(subtotal, discount.discountBasisPoints);
  } else if (discount.discountKind === "amount") {
    discountAmount = BigInt(discount.discountAmount.replace(/\D/g, "") || "0");
  }
  if (discountAmount > subtotal) discountAmount = subtotal;
  const additionalFee = BigInt(discount.additionalFee.replace(/\D/g, "") || "0");
  const total = subtotal - discountAmount + additionalFee;
  return { subtotal, discountAmount, additionalFee, total: total < 0n ? 0n : total };
}

export type PaymentStatus = "draft" | "unpaid" | "partial" | "paid" | "void";

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "unpaid":
      return "Belum Dibayar";
    case "partial":
      return "Dibayar Sebagian";
    case "paid":
      return "Lunas";
    case "void":
      return "Dibatalkan";
  }
}

export function paymentStatus(
  invoiceStatus: "draft" | "final",
  total: bigint,
  paid: bigint,
  voided: boolean,
): PaymentStatus {
  if (voided) return "void";
  if (invoiceStatus === "draft") return "draft";
  if (paid <= 0n) return "unpaid";
  if (paid < total) return "partial";
  return "paid";
}
