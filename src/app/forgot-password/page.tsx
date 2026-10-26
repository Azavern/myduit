import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lupa kata sandi" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Lupa kata sandi"
      description="Pemulihan kata sandi pada prototipe ini dibuat oleh operator aplikasi. Pengiriman email otomatis belum tersedia."
      footer={
        <Link href="/login" className="text-brand-700 hover:underline">
          Kembali ke halaman masuk
        </Link>
      }
    >
      <ForgotPasswordForm />
      <div className="mt-6 rounded-lg border border-border-subtle bg-surface p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink">Langkah pemulihan</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Hubungi operator aplikasi dan buktikan identitas pemohon.</li>
          <li>Operator membuat tautan reset sekali pakai (berlaku 30 menit) dari terminal.</li>
          <li>Buka tautan tersebut, isi kata sandi baru, lalu masuk kembali.</li>
        </ol>
      </div>
    </AuthShell>
  );
}
