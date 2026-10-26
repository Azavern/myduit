"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { IDLE_STATE, errorState, successState, zodFieldErrors, type ActionState } from "@/lib/action-state";
import { clearSessionCookie, readSessionToken, writeSessionCookie } from "@/server/auth/cookies";
import { assertSameOrigin, clientIp } from "@/server/dal/request";
import { currentSessionHash, userHasAnyWorkspace } from "@/server/dal/session";
import { AuthError, toUserMessage } from "@/server/errors";
import { acceptInvitation, login, logout, resetPassword } from "@/server/services/auth";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";

const loginSchema = z.object({
  email: z.string().min(3, "Email wajib diisi.").max(254),
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

const registerSchema = z.object({
  token: z.string().min(10, "Token undangan tidak valid."),
  displayName: z.string().min(1, "Nama tampilan wajib diisi.").max(120),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`).max(256),
  confirm: z.string(),
});

const resetSchema = z.object({
  token: z.string().min(10, "Token reset tidak valid."),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`).max(256),
  confirm: z.string(),
});

export async function loginAction(_prev: ActionState = IDLE_STATE, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState("Periksa kembali data yang dimasukkan.", zodFieldErrors(parsed.error.issues));
  try {
    await assertSameOrigin();
    const token = await login(parsed.data.email, parsed.data.password, await clientIp());
    await writeSessionCookie(token);
  } catch (error) {
    if (error instanceof AuthError) return errorState(error.userMessage);
    return errorState(toUserMessage(error));
  }
  // /onboarding forwards to the last accessible workspace when one exists.
  await userHasAnyWorkspace();
  redirect("/onboarding");
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  await logout(token).catch(() => undefined);
  await clearSessionCookie();
  redirect("/login");
}

export async function registerAction(_prev: ActionState = IDLE_STATE, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return errorState("Periksa kembali data yang dimasukkan.", zodFieldErrors(parsed.error.issues));
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return errorState("Konfirmasi kata sandi tidak sama.", { confirm: "Konfirmasi kata sandi tidak sama." });
  }
  try {
    await assertSameOrigin();
    const sessionHash = await currentSessionHash();
    await acceptInvitation({
      token: parsed.data.token,
      sessionHash,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
      ip: await clientIp(),
    });
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  redirect("/onboarding");
}

export async function resetPasswordAction(_prev: ActionState = IDLE_STATE, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return errorState("Periksa kembali data yang dimasukkan.", zodFieldErrors(parsed.error.issues));
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return errorState("Konfirmasi kata sandi tidak sama.", { confirm: "Konfirmasi kata sandi tidak sama." });
  }
  try {
    await assertSameOrigin();
    await resetPassword(parsed.data.token, parsed.data.password, await clientIp());
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  await clearSessionCookie();
  redirect("/login?reset=1");
}

export async function forgotPasswordAction(_prev: ActionState = IDLE_STATE, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  try {
    await assertSameOrigin();
    // Generic response regardless of whether the account exists: no email is
    // sent from the prototype, the operator issues the reset link (blueprint §6.4).
    if (!email) return errorState("Email wajib diisi.");
  } catch (error) {
    return errorState(toUserMessage(error));
  }
  return successState(
    "Jika email tersebut terdaftar, operator aplikasi akan membuat tautan reset. Pengiriman email otomatis belum tersedia pada prototipe.",
  );
}
