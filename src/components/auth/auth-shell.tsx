import Link from "next/link";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-800 p-10 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand-500/30 blur-3xl"
        />
        <Link href="/" className="relative text-lg font-semibold tracking-tight">
          myduit
        </Link>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Satu sumber data keuangan untuk penjualan, piutang, dan kas.
          </h1>
          <p className="mt-4 text-sm text-brand-100">
            Catat penjualan tunai maupun kredit, alokasikan pembayaran ke tagihan yang tepat, dan pantau saldo kas
            tanpa penjumlahan manual.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {[
              "Banyak tagihan aktif per pelanggan",
              "Pembayaran parsial dengan alokasi eksplisit",
              "Laporan piutang, arus kas, dan audit aktivitas",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 size-1.5 rounded-full bg-brand-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">
          Prototipe pribadi nonkomersial. Bukan pengganti sistem akuntansi atau nasihat pajak.
        </p>
      </section>

      <section className="flex items-center justify-center bg-canvas px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-block text-lg font-semibold text-brand-800 lg:hidden">
            myduit
          </Link>
          <h2 className="text-2xl font-semibold text-ink">{title}</h2>
          <p className="mt-2 text-sm text-ink-muted">{description}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-sm text-ink-muted">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}
