"use server";

import { revalidatePath } from "next/cache";

import { errorState, successState, type ActionState } from "@/lib/action-state";
import { parseJsonPayload, paymentPayloadSchema } from "@/lib/schemas";
import { hashPayload } from "@/server/auth/tokens";
import { runWithSession } from "@/server/dal/context";
import { requireSessionHash } from "@/server/dal/session";
import { assertSameOrigin } from "@/server/dal/request";
import { toUserMessage } from "@/server/errors";
import { claimIdempotency, completeIdempotency } from "@/server/services/idempotency";
import { insertPayment, type InsertPaymentResult } from "@/server/services/payments";

/**
 * Records a customer payment with explicit allocations. The client keeps one
 * request key per attempt so a retried form never posts twice (blueprint §9.4).
 */
export async function recordPaymentAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const parsed = parseJsonPayload(paymentPayloadSchema, formData.get("payload"));
  if (!parsed.success) return errorState(parsed.error, parsed.fieldErrors);
  const payload = parsed.data;

  let result: InsertPaymentResult;
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    result = await runWithSession({ sessionHash, workspaceId }, async (tx, session) => {
      const { requestKey, ...canonical } = payload;
      const claim = await claimIdempotency<InsertPaymentResult>(tx, {
        workspaceId,
        actorId: session.actorId,
        operation: "payment.record",
        requestKey,
        payloadHash: hashPayload(canonical),
      });
      if (claim.kind === "replay") return claim.result;
      const amount = BigInt(payload.amount.replace(/\D/g, "") || "0");
      const saved = await insertPayment(tx, {
        workspaceId,
        customerId: payload.customerId,
        businessDate: payload.businessDate,
        amount,
        cashAccountId: payload.cashAccountId,
        paymentMethodId: payload.paymentMethodId,
        reference: payload.reference ?? null,
        notes: payload.notes ?? null,
        allocations: payload.allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId,
          amount: BigInt(allocation.amount.replace(/\D/g, "") || "0"),
        })),
      });
      await completeIdempotency(tx, claim.id, {
        result: saved,
        resourceType: "payments",
        resourceId: saved.paymentId,
      });
      return saved;
    });
  } catch (error) {
    return errorState(toUserMessage(error));
  }

  revalidatePath(`/w/${workspaceId}/payments`);
  revalidatePath(`/w/${workspaceId}/receivables`);
  revalidatePath(`/w/${workspaceId}/customers`);
  revalidatePath(`/w/${workspaceId}/dashboard`);
  revalidatePath(`/w/${workspaceId}/sales`);
  return successState(`Pembayaran ${result.number} tercatat.`);
}
