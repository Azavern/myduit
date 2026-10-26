/**
 * Client-side idempotency keys.
 *
 * `public.idempotency_requests.request_key` is a uuid and is unique per
 * (workspace, actor, operation). A key must therefore be:
 *
 *  - stable while the payload stays the same, so a retried submission replays
 *    instead of creating a second document;
 *  - different once the payload changes, because a replayed key with a
 *    different payload_hash is rejected as a conflict;
 *  - different for every form instance, so two intentionally identical
 *    documents created in separate sessions both go through.
 *
 * A deterministic hash of the payload alone cannot satisfy the last point, so
 * keys combine a per-form random nonce with a hash of the payload signature.
 * Everything here is pure and synchronous: the key is derived during render,
 * which keeps it stable across re-renders without an effect.
 */

const HEX_BYTES = 16; // 128-bit nonce

/** 128-bit random nonce in hex. Falls back to Math.random without WebCrypto. */
export function requestNonce(): string {
  const bytes = new Uint8Array(HEX_BYTES);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/** FNV-1a (64 bit) over UTF-16 code units, as 16 hex characters. */
export function signatureHash(value: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Builds a uuid-format idempotency key from a form nonce and payload signature. */
export function deriveRequestKey(nonce: string, signature: string): string {
  const hex = `${nonce.slice(0, HEX_BYTES)}${signatureHash(`${nonce}:${signature}`)}`.toLowerCase();
  const safe = hex.replace(/[^0-9a-f]/g, "").padEnd(32, "0").slice(0, 32);
  return `${safe.slice(0, 8)}-${safe.slice(8, 12)}-${safe.slice(12, 16)}-${safe.slice(16, 20)}-${safe.slice(20)}`;
}

export const REQUEST_KEY_PLACEHOLDER = '"requestKey":""';

/** Serialises a payload that carries an empty requestKey placeholder. */
export function injectRequestKey(payloadJson: string, requestKey: string): string {
  return payloadJson.replace(REQUEST_KEY_PLACEHOLDER, `"requestKey":${JSON.stringify(requestKey)}`);
}
