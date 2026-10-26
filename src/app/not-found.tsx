import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="text-2xl font-semibold text-ink">Halaman tidak ditemukan</h1>
      <p className="text-sm text-ink-muted">
        Tautan yang Anda buka tidak tersedia atau Anda tidak memiliki akses ke halaman tersebut.
      </p>
      <Link
        href="/onboarding"
        className="mt-2 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        Kembali ke workspace
      </Link>
    </main>
  );
}
