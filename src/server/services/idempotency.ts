import "server-only";

import type { Tx } from "@/server/db/client";
import { ConflictError } from "@/server/errors";

export type IdempotencyResult<T> =
  | { kind: "claimed"; id: string }
  | { kind: "replay"; result: T };

/**
 * Claims an idempotency key inside the caller's transaction. A replayed key
 * with an identical payload returns the original result; an identical key with
 * a different payload is a conflict (blueprint §9.4).
 */
export async function claimIdempotency<T>(
  tx: Tx,
  input: {
    workspaceId: string;
    actorId: string;
    operation: string;
    requestKey: string;
    payloadHash: string;
  },
): Promise<IdempotencyResult<T>> {
  const inserted = await tx<{ id: string }[]>`
    insert into public.idempotency_requests (workspace_id, actor_id, operation, request_key, payload_hash)
    values (${input.workspaceId}, ${input.actorId}, ${input.operation}, ${input.requestKey}::uuid, ${input.payloadHash})
    on conflict (workspace_id, actor_id, operation, request_key) do nothing
    returning id
  `;
  const claimed = inserted[0];
  if (claimed) return { kind: "claimed", id: claimed.id };

  const existing = await tx<{ id: string; payload_hash: string; status: string; result: unknown }[]>`
    select id, payload_hash, status, result from public.idempotency_requests
    where workspace_id = ${input.workspaceId} and actor_id = ${input.actorId}
      and operation = ${input.operation} and request_key = ${input.requestKey}::uuid
  `;
  const row = existing[0];
  if (!row) throw new ConflictError("Permintaan duplikat sedang diproses. Coba lagi sebentar.");
  if (row.payload_hash !== input.payloadHash) {
    throw new ConflictError("Kunci idempotensi sudah dipakai untuk payload yang berbeda.");
  }
  if (row.status !== "completed") {
    throw new ConflictError("Permintaan dengan kunci ini sedang diproses.");
  }
  return { kind: "replay", result: row.result as T };
}

export async function completeIdempotency(
  tx: Tx,
  id: string,
  input: { result: unknown; resourceType: string; resourceId: string },
): Promise<void> {
  await tx`
    update public.idempotency_requests set
      status = 'completed',
      result = ${JSON.stringify(input.result)}::jsonb,
      resource_type = ${input.resourceType},
      resource_id = ${input.resourceId}::uuid,
      completed_at = now()
    where id = ${id}
  `;
}
