"use server";

import { revalidatePath } from "next/cache";

import { errorState, successState, type ActionState } from "@/lib/action-state";
import { hashPayload } from "@/server/auth/tokens";
import {
  parseJsonPayload,
  transactionPayloadSchema,
  transferPayloadSchema,
} from "@/lib/schemas";
import { runWithSession } from "@/server/dal/context";
import { assertSameOrigin } from "@/server/dal/request";
import { requireSessionHash } from "@/server/dal/session";
import { toUserMessage } from "@/server/errors";
import {
  createFinancialTransaction,
  createTransfer,
  reverseFinancialTransaction,
  reverseTransfer,
} from "@/server/services/cash";
import { claimIdempotency, completeIdempotency } from "@/server/services/idempotency";

function revalidateCash(workspaceId: string) {
  revalidatePath(`/w/${workspaceId}/transactions`);
  revalidatePath(`/w/${workspaceId}/cash-accounts`);
  revalidatePath(`/w/${workspaceId}/dashboard`);
  revalidatePath(`/w/${workspaceId}/reports`);
}

export async function createTransactionAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const parsed = parseJsonPayload(transactionPayloadSchema, formData.get("payload"));
  if (!parsed.success) return errorState(parsed.error, parsed.fieldErrors);
  const payload = parsed.data;
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx, session) => {
      const { requestKey, ...canonical } = payload;
      const claim = await claimIdempotency(tx, {
        workspaceId,
        actorId: session.actorId,
        operation: "cash.transaction",
        requestKey,
        payloadHash: hashPayload(canonical),
      });
      if (claim.kind === "replay") return;
      const saved = await createFinancialTransaction(tx, {
        workspaceId,
        kind: payload.kind,
        businessDate: payload.businessDate,
        categoryId: payload.categoryId,
        cashAccountId: payload.cashAccountId,
        paymentMethodId: payload.paymentMethodId ?? null,
        amount: BigInt(payload.amount.replace(/\D/g, "") || "0"),
        description: payload.description,
        counterparty: payload.counterparty ?? null,
        reference: payload.reference ?? null,
        notes: payload.notes ?? null,
      });
      await completeIdempotency(tx, claim.id, {
        result: saved,
        resourceType: "financial_transactions",
        resourceId: saved.id,
      });
    });
    revalidateCash(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Transaksi kas disimpan.");
}

export async function createTransferAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const parsed = parseJsonPayload(transferPayloadSchema, formData.get("payload"));
  if (!parsed.success) return errorState(parsed.error, parsed.fieldErrors);
  const payload = parsed.data;
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx, session) => {
      const { requestKey, ...canonical } = payload;
      const claim = await claimIdempotency(tx, {
        workspaceId,
        actorId: session.actorId,
        operation: "cash.transfer",
        requestKey,
        payloadHash: hashPayload(canonical),
      });
      if (claim.kind === "replay") return;
      const saved = await createTransfer(tx, {
        workspaceId,
        businessDate: payload.businessDate,
        sourceAccountId: payload.sourceAccountId,
        destinationAccountId: payload.destinationAccountId,
        amount: BigInt(payload.amount.replace(/\D/g, "") || "0"),
        fee: BigInt(payload.fee.replace(/\D/g, "") || "0"),
        feeCategoryId: payload.feeCategoryId ?? null,
        reference: payload.reference ?? null,
        notes: payload.notes ?? null,
      });
      await completeIdempotency(tx, claim.id, {
        result: saved,
        resourceType: "cash_transfers",
        resourceId: saved.id,
      });
    });
    revalidateCash(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Transfer disimpan. Transfer tidak dihitung sebagai pemasukan/pengeluaran operasional.");
}

export async function reverseTransactionAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  const businessDate = String(formData.get("businessDate") ?? "");
  const reason = String(formData.get("reason") ?? "");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await reverseFinancialTransaction(tx, { workspaceId, transactionId, businessDate, reason });
    });
    revalidateCash(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Transaksi dikoreksi dengan pembalikan.");
}

export async function reverseTransferAction(_prev: ActionState = { status: "idle" }, formData: FormData): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const transferId = String(formData.get("transferId") ?? "");
  const businessDate = String(formData.get("businessDate") ?? "");
  const reason = String(formData.get("reason") ?? "");
  try {
    await assertSameOrigin();
    const sessionHash = await requireSessionHash();
    await runWithSession({ sessionHash, workspaceId }, async (tx) => {
      await reverseTransfer(tx, { workspaceId, transferId, businessDate, reason });
    });
    revalidateCash(workspaceId);
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState("Transfer dan biaya terkait dikoreksi.");
}
