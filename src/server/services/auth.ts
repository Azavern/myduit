import "server-only";

import { generateToken, hashIp, hashToken } from "@/server/auth/tokens";
import { getDummyHash, hashPassword, assertPasswordPolicy, verifyPassword } from "@/server/auth/password";
import { getRuntimeEnv } from "@/server/env";
import { runWithoutSession, runWithSession } from "@/server/dal/context";
import { AuthError, ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { RATE_LIMITS, consumeRateLimit } from "@/server/services/rate-limit";
import type { Tx } from "@/server/db/client";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requirePepper(): string {
  return getRuntimeEnv().AUTH_TOKEN_PEPPER;
}

async function enforceIpLimit(tx: Tx, ip: string, rule: { limit: number; windowSeconds: number }, scope: string): Promise<void> {
  const allowed = await consumeRateLimit(tx, hashIp(`${scope}:${ip}`, requirePepper()), rule.windowSeconds, rule.limit);
  if (!allowed) {
    throw new ForbiddenError("Terlalu banyak percobaan. Silakan coba lagi nanti.");
  }
}

/**
 * Verifies email + password and creates a database session.
 * Returns the raw session token that belongs in the browser cookie only.
 */
export async function login(email: string, password: string, ip: string): Promise<string> {
  const pepper = requirePepper();
  const env = getRuntimeEnv();
  const normalized = normalizeEmail(email);

  return runWithoutSession(async (tx) => {
    await enforceIpLimit(tx, ip, RATE_LIMITS.loginPerIp, "login-ip");

    const credentials = await tx<{ user_id: string; password_hash: string }[]>`
      select user_id, password_hash from app_private.get_login_credential(${normalized}::text)
    `;
    const credential = credentials[0];
    const storedHash = credential?.password_hash ?? (await getDummyHash());
    const passwordOk = await verifyPassword(password, storedHash);

    if (!credential || !passwordOk) {
      // Count only failures for the per-identity bucket.
      const identityAllowed = await consumeRateLimit(
        tx,
        hashToken("ratelimit", `login-id:${normalized}`, pepper),
        RATE_LIMITS.loginPerIdentity.windowSeconds,
        RATE_LIMITS.loginPerIdentity.limit,
      );
      if (!identityAllowed) {
        throw new ForbiddenError("Terlalu banyak percobaan masuk. Silakan coba lagi nanti.");
      }
      throw new AuthError("Email atau kata sandi tidak cocok.");
    }

    const token = generateToken();
    await tx`
      select app_private.create_session(
        ${credential.user_id}::uuid,
        ${hashToken("session", token, pepper)}::text,
        ${storedHash}::text,
        ${env.SESSION_ABSOLUTE_HOURS * 3600}::int,
        ${env.SESSION_IDLE_HOURS * 3600}::int
      )
    `;
    return token;
  });
}

export async function logout(sessionToken: string | null): Promise<void> {
  if (!sessionToken) return;
  const hash = hashToken("session", sessionToken, requirePepper());
  await runWithoutSession(async (tx) => {
    await tx`select app_private.revoke_session(${hash}::text)`;
  });
}

export type AcceptInvitationInput = {
  token: string;
  sessionHash: string | null;
  displayName?: string;
  password?: string;
  ip: string;
};

/**
 * Registers an invited user, or links an already-authenticated account whose
 * email matches the invitation. The database helper enforces both cases.
 */
export async function acceptInvitation(input: AcceptInvitationInput): Promise<string> {
  const pepper = requirePepper();
  const tokenHash = hashToken("invitation", input.token, pepper);

  let passwordHash: string | null = null;
  if (input.password) {
    assertPasswordPolicy(input.password);
    passwordHash = await hashPassword(input.password);
  }
  const displayName = input.displayName?.trim() || null;

  const execute = async (tx: Tx) => {
    const rows = await tx<{ accept_invitation: string }[]>`
      select app_private.accept_invitation(${tokenHash}::text, ${displayName}::text, ${passwordHash}::text) as accept_invitation
    `;
    return rows[0]?.accept_invitation ?? "";
  };

  if (input.sessionHash) {
    return runWithSession({ sessionHash: input.sessionHash }, execute);
  }

  return runWithoutSession(async (tx) => {
    await enforceIpLimit(tx, input.ip, RATE_LIMITS.registerPerIp, "register-ip");
    return execute(tx);
  });
}

/**
 * Operator-driven reset: validates and consumes a single-use token, sets the
 * new password, and revokes every session of that user atomically.
 */
export async function resetPassword(token: string, password: string, ip: string): Promise<void> {
  assertPasswordPolicy(password);
  const pepper = requirePepper();
  const tokenHash = hashToken("reset", token, pepper);
  const passwordHash = await hashPassword(password);

  await runWithoutSession(async (tx) => {
    await enforceIpLimit(tx, ip, RATE_LIMITS.resetPerIp, "reset-ip");
    await tx`select app_private.consume_password_reset(${tokenHash}::text, ${passwordHash}::text)`;
  });
}

/**
 * Invitation links are created by owner/admin. The raw token is returned once
 * so the operator can share the link; only its HMAC is stored.
 */
export async function createInvitation(input: {
  sessionHash: string;
  workspaceId: string;
  email: string;
  role: "admin" | "finance" | "cashier" | "viewer";
}): Promise<{ invitationId: string; token: string }> {
  const pepper = requirePepper();
  const token = generateToken();
  const tokenHash = hashToken("invitation", token, pepper);
  const invitationId = await runWithSession(
    { sessionHash: input.sessionHash, workspaceId: input.workspaceId },
    async (tx) => {
      const rows = await tx<{ id: string }[]>`
        select app_private.create_invitation(
          ${input.workspaceId}::uuid,
          ${input.email}::text,
          ${input.role}::public.membership_role,
          ${tokenHash}::text
        ) as id
      `;
      return rows[0]?.id;
    },
  );
  if (!invitationId) throw new ConflictError("Undangan tidak dapat dibuat.");
  return { invitationId, token };
}

export async function revokeInvitation(input: {
  sessionHash: string;
  workspaceId: string;
  invitationId: string;
}): Promise<void> {
  await runWithSession(
    { sessionHash: input.sessionHash, workspaceId: input.workspaceId },
    async (tx) => {
      await tx`select app_private.revoke_invitation(${input.workspaceId}::uuid, ${input.invitationId}::uuid)`;
    },
  );
}

export function assertInviteRole(value: string): asserts value is "admin" | "finance" | "cashier" | "viewer" {
  if (!["admin", "finance", "cashier", "viewer"].includes(value)) {
    throw new ValidationError("Peran undangan tidak valid.");
  }
}
