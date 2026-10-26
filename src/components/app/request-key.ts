"use client";

import { useMemo, useState } from "react";

import { deriveRequestKey, requestNonce } from "@/lib/idempotency";

/**
 * Idempotency key for a form, derived from the serialised payload.
 * The nonce is created once per form instance; the key follows the payload so a
 * retry of the same payload replays and an edited payload submits cleanly.
 */
export function useRequestKey(signature: string): string {
  const [nonce] = useState(requestNonce);
  return useMemo(() => deriveRequestKey(nonce, signature), [nonce, signature]);
}
