import { describe, expect, it } from "vitest";

import { deriveRequestKey, injectRequestKey, requestNonce, signatureHash } from "@/lib/idempotency";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("requestNonce", () => {
  it("returns 32 hex characters and does not repeat", () => {
    const first = requestNonce();
    const second = requestNonce();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});

describe("signatureHash", () => {
  it("is deterministic and stable across calls", () => {
    expect(signatureHash("{}")).toBe(signatureHash("{}"));
    expect(signatureHash("a")).not.toBe(signatureHash("b"));
    expect(signatureHash("a")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("deriveRequestKey", () => {
  it("produces a uuid from a nonce and signature", () => {
    const key = deriveRequestKey("a".repeat(32), '{"amount":"1000"}');
    expect(key).toMatch(UUID);
  });

  it("is stable for the same nonce and signature", () => {
    const nonce = requestNonce();
    const signature = '{"amount":"1000"}';
    expect(deriveRequestKey(nonce, signature)).toBe(deriveRequestKey(nonce, signature));
  });

  it("changes when the payload signature changes", () => {
    const nonce = requestNonce();
    expect(deriveRequestKey(nonce, '{"amount":"1000"}')).not.toBe(deriveRequestKey(nonce, '{"amount":"2000"}'));
  });

  it("changes per form instance so identical documents stay distinct", () => {
    const signature = '{"amount":"1000"}';
    expect(deriveRequestKey(requestNonce(), signature)).not.toBe(deriveRequestKey(requestNonce(), signature));
  });

  it("tolerates a non-hex nonce without producing an invalid uuid", () => {
    expect(deriveRequestKey("zzzz!!", "signature")).toMatch(UUID);
  });
});

describe("injectRequestKey", () => {
  it("replaces only the empty placeholder", () => {
    const payload = '{"amount":"1000","requestKey":""}';
    const key = deriveRequestKey(requestNonce(), payload);
    expect(injectRequestKey(payload, key)).toBe(`{"amount":"1000","requestKey":"${key}"}`);
  });

  it("leaves text that merely resembles the placeholder alone", () => {
    const payload = '{"notes":"\\"requestKey\\":\\"\\"","requestKey":""}';
    expect(injectRequestKey(payload, "key-1")).toBe('{"notes":"\\"requestKey\\":\\"\\"","requestKey":"key-1"}');
  });
});
