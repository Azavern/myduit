"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/modules/auth/actions";

function FormMessage({ status, message }: { status: "idle" | "error" | "success"; message?: string }) {
  if (!message || status === "idle") return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger"
          : "rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

function PasswordToggle({ visible, onToggle, id }: { visible: boolean; onToggle: () => void; id: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
      aria-pressed={visible}
      aria-controls={id}
    >
      {visible ? "Sembunyikan" : "Tampilkan"}
    </button>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, IDLE_STATE);
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="username" required aria-describedby="email-error" />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Kata sandi
          </label>
          <PasswordToggle visible={visible} onToggle={() => setVisible((value) => !value)} id="password" />
        </div>
        <Input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          required
          aria-describedby="password-error"
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" role="alert" className="text-xs font-medium text-danger">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>
      <Button type="submit" loading={pending} className="w-full">
        Masuk
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">
          Lupa kata sandi?
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(registerAction, IDLE_STATE);
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage status={state.status} message={state.message} />
      <Field label="Nama tampilan" htmlFor="displayName" error={state.fieldErrors?.displayName}>
        <Input id="displayName" name="displayName" autoComplete="name" required aria-describedby="displayName-error" />
      </Field>
      <Field
        label="Kata sandi"
        htmlFor="password"
        hint="Minimal 12 karakter. Frasa sandi panjang dianjurkan."
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          aria-describedby="password-error"
        />
      </Field>
      <div className="flex justify-end">
        <PasswordToggle visible={visible} onToggle={() => setVisible((value) => !value)} id="password" />
      </div>
      <Field label="Ulangi kata sandi" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input
          id="confirm"
          name="confirm"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          aria-describedby="confirm-error"
        />
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        Buat akun &amp; gabung
      </Button>
      <p className="text-xs text-ink-subtle">
        Tautan undangan bukan bukti verifikasi email. Kepemilikan alamat email belum diverifikasi pada prototipe ini.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, IDLE_STATE);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <Field label="Email akun" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        Kirim permintaan
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, IDLE_STATE);
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage status={state.status} message={state.message} />
      <Field label="Kata sandi baru" htmlFor="password" hint="Minimal 12 karakter." error={state.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
        />
      </Field>
      <div className="flex justify-end">
        <PasswordToggle visible={visible} onToggle={() => setVisible((value) => !value)} id="password" />
      </div>
      <Field label="Ulangi kata sandi baru" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type={visible ? "text" : "password"} autoComplete="new-password" required />
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        Simpan kata sandi baru
      </Button>
    </form>
  );
}
