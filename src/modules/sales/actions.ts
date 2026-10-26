"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { errorState, successState, type ActionState } from "@/lib/action-state";
import { parseJsonPayload, invoicePayloadSchema } from "@/lib/schemas";
import { hashPayload } from "@/server/auth/tokens";
import { runWithSession } from "@/server/dal/context";
import { requireSessionHash, getWorkspaceContext } from "@/server/dal/session";
import { assertSameOrigin } from "@/server/dal/request";
import { toUserMessage } from "@/server/errors";
import { claimIdempotency, completeIdempotency } from "@/server/services/idempotency";
import { reversePayment } from "@/server/services/payments";
import { saveInvoice, voidInvoice, type SaveInvoiceResult } from "@/server/services/sales";

export async function saveInvoiceAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const parsed = parseJsonPayload(invoicePayloadSchema, formData.get("payload"));
  if (!parsed.success) return errorState(parsed.error, parsed.fieldErrors);
  const payload = parsed.data;
  // The submit button carries the intended outcome for this attempt.
  const finalize = String(formData.get("mode") ?? "draft") === "final";
  if (finalize && !payload.dueDate && payload.customerId) {
    return errorState("Penjualan kredit memerlukan tanggal jatuh tempo.");
  }

  let result: SaveInvoiceResult;
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    const context = await getWorkspaceContext(sessionHash, workspaceId);
    if (!context) return errorState("Anda tidak memiliki akses ke workspace ini.");
    result = await runWithSession({ sessionHash, workspaceId }, async (tx, session) => {
      const { requestKey, ...canonical } = payload;
      const claim = await claimIdempotency<SaveInvoiceResult>(tx, {
        workspaceId,
        actorId: session.actorId,
        operation: "invoice.save",
        requestKey,
        payloadHash: hashPayload({ ...canonical, mode: finalize ? "final" : "draft" }),
      });
      if (claim.kind === "replay") return claim.result;
      const saved = await saveInvoice(tx, {
        workspaceId,
        timezone: context.workspace.timezone,
        invoiceId: payload.invoiceId ?? null,
        customerId: payload.customerId,
        businessDate: payload.businessDate,
        dueDate: payload.dueDate,
        notes: payload.notes ?? null,
        discountKind: payload.discountKind,
        discountBasisPoints: payload.discountBasisPoints,
        discountAmount: payload.discountAmount,
        additionalFee: payload.additionalFee,
        additionalFeeLabel: payload.additionalFeeLabel ?? null,
        overrideReason: payload.overrideReason ?? null,
        lines: payload.lines,
        finalize,
        deposit: payload.deposit ?? null,
      });
      await completeIdempotency(tx, claim.id, {
        result: saved,
        resourceType: "sales_invoices",
        resourceId: saved.invoiceId,
      });
      return saved;
    });
  } catch (error) {
    return errorState(toUserMessage(error));
  }

  revalidatePath(`/w/${workspaceId}/sales`);
  revalidatePath(`/w/${workspaceId}/dashboard`);
  if (result.finalized) {
    redirect(`/w/${workspaceId}/sales/${result.invoiceId}?finalized=1`);
  }
  redirect(`/w/${workspaceId}/sales/${result.invoiceId}/edit?saved=1`);
}

export async function voidInvoiceAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const businessDate = String(formData.get("businessDate") ?? "");
  const reason = String(formData.get("reason") ?? "");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await voidInvoice(tx, { workspaceId, invoiceId, businessDate, reason });
    });
    revalidatePath(`/w/${workspaceId}/sales/${invoiceId}`);
    revalidatePath(`/w/${workspaceId}/sales`);
    revalidatePath(`/w/${workspaceId}/receivables`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Tagihan dibatalkan. Nomor dokumen tidak digunakan ulang.");
}

export async function reversePaymentAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const businessDate = String(formData.get("businessDate") ?? "");
  const reason = String(formData.get("reason") ?? "");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await reversePayment(tx, { workspaceId, paymentId, businessDate, reason });
    });
    if (invoiceId) revalidatePath(`/w/${workspaceId}/sales/${invoiceId}`);
    revalidatePath(`/w/${workspaceId}/payments`);
    revalidatePath(`/w/${workspaceId}/receivables`);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Pembayaran dibalikkan. Pergerakan kas dikoreksi.");
}
