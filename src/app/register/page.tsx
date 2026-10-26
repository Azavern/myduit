import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/forms";
import { currentSessionHash } from "@/server/dal/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Terima undangan" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim();
  const sessionHash = await currentSessionHash();

  if (!token) {
    return (
      <AuthShell
        title="Pendaftaran hanya melalui undangan"
        description="Prototipe ini tidak membuka pendaftaran publik. Minta tautan undangan dari owner atau admin workspace."
        footer={
          <Link href="/login" className="text-brand-700 hover:underline">
            Kembali ke halaman masuk
          </Link>
        }
      >
        <div className="rounded-lg border border-border-subtle bg-surface p-4 text-sm text-ink-muted">
          <p>
            Tautan undangan berlaku 72 jam dan hanya dapat dipakai sekali. Jika tautan Anda sudah kedaluwarsa, minta
            owner/admin membuat tautan baru.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg border border-border-subtle bg-surface text-sm font-medium text-ink hover:bg-brand-50"
          >
            Masuk dengan akun yang sudah ada
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (sessionHash) {
    // Already signed in: the account is linked to the invitation by email.
    return (
      <AuthShell
        title="Terima undangan"
        description="Anda sudah masuk. Sistem akan menautkan akun ini jika emailnya cocok dengan undangan."
        footer={
          <Link href="/onboarding" className="text-brand-700 hover:underline">
            Lanjut ke workspace
          </Link>
        }
      >
        <RegisterForm token={token} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Buat akun untuk menerima undangan"
      description="Isi nama tampilan dan kata sandi. Email akun mengikuti email pada undangan."
      footer={
        <Link href="/login" className="text-brand-700 hover:underline">
          Sudah punya akun? Masuk di sini
        </Link>
      }
    >
      <RegisterForm token={token} />
    </AuthShell>
  );
}
