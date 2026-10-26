import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { currentSessionHash } from "@/server/dal/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const sessionHash = await currentSessionHash();
  if (sessionHash) redirect("/onboarding");
  const params = await searchParams;

  return (
    <AuthShell
      title="Masuk ke myduit"
      description="Gunakan email dan kata sandi akun aplikasi Anda. Akun dibuat lewat undangan operator."
      footer={
        <div className="space-y-2">
          {params.reset ? (
            <p className="rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success">
              Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.
            </p>
          ) : null}
          <p>
            Belum punya akun? Pendaftaran bersifat invite-only.{" "}
            <Link href="/forgot-password" className="text-brand-700 hover:underline">
              Butuh bantuan?
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
