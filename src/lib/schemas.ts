import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidSchema = z.string().regex(UUID_RE, "ID tidak valid.");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD).");
const discountKind = z.enum(["none", "amount", "percent"]);

export const invoiceLineSchema = z.object({
  productId: uuidSchema,
  unitOptionId: z.union([uuidSchema, z.null()]),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  discountKind,
  discountAmount: z.string().default("0"),
  discountBasisPoints: z.number().int().min(0).max(10000).default(0),
});

export const invoicePayloadSchema = z.object({
  invoiceId: z.union([uuidSchema, z.null()]).optional(),
  customerId: z.union([uuidSchema, z.null()]),
  businessDate: dateSchema,
  dueDate: z.union([dateSchema, z.null()]),
  notes: z.union([z.string().max(2000), z.null()]).optional(),
  discountKind,
  discountBasisPoints: z.number().int().min(0).max(10000),
  discountAmount: z.string(),
  additionalFee: z.string(),
  additionalFeeLabel: z.union([z.string().max(120), z.null()]).optional(),
  overrideReason: z.union([z.string().max(500), z.null()]).optional(),
  lines: z.array(invoiceLineSchema).min(1, "Minimal satu baris produk."),
  deposit: z
    .object({
      amount: z.string(),
      cashAccountId: uuidSchema,
      paymentMethodId: uuidSchema,
      reference: z.union([z.string().max(200), z.null()]).optional(),
    })
    .nullable()
    .optional(),
  requestKey: uuidSchema,
});

export type InvoicePayload = z.infer<typeof invoicePayloadSchema>;

export const paymentPayloadSchema = z.object({
  customerId: z.union([uuidSchema, z.null()]),
  businessDate: dateSchema,
  amount: z.string().min(1),
  cashAccountId: uuidSchema,
  paymentMethodId: uuidSchema,
  reference: z.union([z.string().max(200), z.null()]).optional(),
  notes: z.union([z.string().max(2000), z.null()]).optional(),
  allocations: z
    .array(z.object({ invoiceId: uuidSchema, amount: z.string().min(1) }))
    .min(1, "Minimal satu alokasi tagihan."),
  requestKey: uuidSchema,
});

export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;

export const transactionPayloadSchema = z.object({
  kind: z.enum(["income", "expense"]),
  businessDate: dateSchema,
  categoryId: uuidSchema,
  cashAccountId: uuidSchema,
  paymentMethodId: z.union([uuidSchema, z.null()]).optional(),
  amount: z.string().min(1),
  description: z.string().min(1).max(500),
  counterparty: z.union([z.string().max(200), z.null()]).optional(),
  reference: z.union([z.string().max(200), z.null()]).optional(),
  notes: z.union([z.string().max(2000), z.null()]).optional(),
  requestKey: uuidSchema,
});

export const transferPayloadSchema = z.object({
  businessDate: dateSchema,
  sourceAccountId: uuidSchema,
  destinationAccountId: uuidSchema,
  amount: z.string().min(1),
  fee: z.string().default("0"),
  feeCategoryId: z.union([uuidSchema, z.null()]).optional(),
  reference: z.union([z.string().max(200), z.null()]).optional(),
  notes: z.union([z.string().max(2000), z.null()]).optional(),
  requestKey: uuidSchema,
});

export function parseJsonPayload<T>(schema: z.ZodType<T>, raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") return { success: false as const, error: "Data form tidak lengkap." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { success: false as const, error: "Data form tidak dapat dibaca." };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false as const, error: "Periksa kembali data yang dimasukkan.", fieldErrors };
  }
  return { success: true as const, data: parsed.data };
}
