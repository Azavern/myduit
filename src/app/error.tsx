"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-ink">Terjadi kesalahan</h1>
      <p className="text-sm text-ink-muted">
        Permintaan tidak dapat diproses. Silakan coba lagi; jika berulang, hubungi operator aplikasi.
      </p>
      <Button onClick={reset} className="mt-2">
        Coba lagi
      </Button>
    </main>
  );
}
