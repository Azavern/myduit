import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/forms";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset kata sandi",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim();

  if (!token) {
    return (
      <AuthShell
        title="Tautan reset tidak lengkap"
        description="Tautan reset memerlukan token. Minta operator aplikasi membuat tautan baru."
        footer={
          <Link href="/login" className="text-brand-700 hover:underline">
            Kembali ke halaman masuk
          </Link>
        }
      >
        <p className="rounded-lg border border-border-subtle bg-surface p-4 text-sm text-ink-muted">
          Token reset bersifat sekali pakai dan hanya berlaku 30 menit. Tautan lama tidak dapat digunakan kembali.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Atur kata sandi baru"
      description="Menyimpan kata sandi baru akan mencabut seluruh sesi aktif akun ini."
      footer={
        <Link href="/login" className="text-brand-700 hover:underline">
          Kembali ke halaman masuk
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
