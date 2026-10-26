# Strategi tes

## Lapisan

| Lapisan | Perkakas | Perintah | Butuh DB |
| --- | --- | --- | --- |
| Unit | Vitest (node) | `pnpm test` | Tidak |
| Integrasi DB | Vitest | `pnpm test:integration` | Ya (`DATABASE_URL`) |
| E2E | Playwright | `pnpm test:e2e` | Ya |

Unit test berjalan di `tests/unit/**`, konfigurasi `vitest.config.ts` memakai
alias `@` → `src` dan mengganti paket penanda `server-only` dengan stub di
`tests/stubs/server-only.ts` supaya modul server dapat diimpor langsung.

## Cakupan saat ini (51 tes)

- `money.test.ts` — pembulatan setengah ke atas, perkalian kuantitas × harga
  (termasuk kasus yang merusak floating point), diskon persen basis poin,
  format/parse rupiah, validasi kuantitas.
- `dates.test.ts` — "hari ini" di zona waktu workspace, validasi tanggal,
  aritmetika hari, resolusi periode preset/kustom (termasuk rentang terbalik),
  pengelompokan aging.
- `invoice.test.ts` — diskon baris (dibatasi bruto), diskon invoice, tambahan
  biaya, total tidak negatif, derivasi status pembayaran.
- `permissions.test.ts` — matriks peran/izin, termasuk penolakan izin tak dikenal.
- `csv.test.ts` — netralisasi formula spreadsheet, BOM, escape pemisah, nama file.
- `idempotency.test.ts` — nonce acak, hash tanda tangan deterministik, kunci
  uuid stabil per (instance, payload), berubah saat payload berubah, penyisipan
  kunci hanya mengganti placeholder kosong.
- `parity.test.ts` — **paritas skrip operator ↔ aplikasi**: hash scrypt yang
  dibuat salah satu pihak dapat diverifikasi pihak lain, HMAC token identik untuk
  setiap tujuan, dan aturan validasi lingkungan (`scripts/lib/env.mjs`) setuju
  dengan `src/server/env.ts` pada konfigurasi valid maupun invalid.

## Yang belum diuji otomatis

- Invarian basis data terhadap PostgreSQL nyata (saldo tagihan, alokasi
  pembayaran, idempotensi, isolasi antar-workspace, pencabutan sesi).
- Alur HTTP/Server Action dan komponen React (tidak ada tes komponen).
- Skrip operator terhadap database sungguhan (jalur kesalahan sudah diuji).

Tutup celah ini dengan `tests/integration/**` yang **melewati diri sendiri**
ketika `DATABASE_URL` tidak ada, supaya `pnpm test` tetap dapat dijalankan tanpa
PostgreSQL. Catat tes yang dilewati sebagai belum dijalankan — bukan lulus.

## Verifikasi manual sebelum rilis

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
2. `supabase start && pnpm setup -- --migrate`, lalu `pnpm bootstrap:owner`.
3. Alur utama: masuk → buat workspace → invoice final → pembayaran sebagian →
   piutang → laporan → ekspor CSV → audit.
4. Periksa isolasi: dua akun, dua workspace, pastikan daftar dan detail tidak
   saling terlihat.

## Peringatan yang diketahui

- `react-hooks/incompatible-library` pada `useReactTable` (TanStack Table):
  peringatan informasi dari plugin React Compiler, bukan kegagalan.
