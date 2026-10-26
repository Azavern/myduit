# Catatan perubahan

Format: rilis terbaru di atas. Setiap perubahan perilaku menambah satu bagian.

## 2026-10-14 — Fondasi P0

**Skema & database**

- Migrasi awal `20261013200530_initial_finance_schema.sql`: seluruh tabel domain
  (users, workspaces, memberships, katalog, penjualan, pembayaran, kas, audit,
  idempotensi), domain `public.idr_amount`, tipe enum, 68 trigger penjaga, RLS
  paksa, dan role runtime `finance_runtime` tanpa hak istimewa.

**Autentikasi & sesi**

- Login kredensial sendiri dengan scrypt (N=131072, r=8, p=1), hash dummy untuk
  pemerataan waktu, rate limit ganda (IP + identitas), token HMAC berpepper.
- Alur undangan anggota (72 jam) dan reset kata sandi sekali pakai (30 menit)
  yang mencabut seluruh sesi aktif.

**Aplikasi**

- Kerangka UI (sidebar, navigasi berbasis izin, pemilih workspace), halaman
  autentikasi, onboarding pembuatan workspace dengan template.
- Modul penjualan (invoice draft/final, diskon per baris & invoice, uang muka),
  piutang dengan aging, pembayaran dengan alokasi otomatis, kas (transaksi,
  transfer, koreksi), master data, laporan, ekspor CSV, audit, pengaturan.
- Kalkulasi uang terpusat di `src/lib/money.ts` + `src/lib/invoice.ts` (Decimal.js,
  pembulatan setengah ke atas, tanpa floating point).

**Perkakas**

- Skrip operator: `env:check`, `secrets:generate`, `setup`, `bootstrap:owner`,
  `auth:reset`, `db:backup`.
- Unit test Vitest (uang, tanggal, invoice, izin, CSV, idempotensi, paritas
  skrip↔aplikasi) dan workflow CI GitHub Actions.

**Perbaikan bug selama pengembangan**

- `csvFileName` menghasilkan tanda hubung ganda ketika nama dasar berakhir dengan
  karakter non-alfanumerik; sekarang tanda hubung digabung dan dipangkas.
- Tiga formulir uang membuat `requestKey` di dalam `useEffect` (setState dalam
  efek, melanggar `react-hooks/set-state-in-effect` dan berpotensi memicu render
  berantai). Kunci sekarang diturunkan saat render dari nonce per-form instance
  dan hash tanda tangan payload; perilaku idempotensi tetap sama.
- `AppShell` menerima prop `workspaceName` yang tidak pernah dipakai; prop
  dihapus (nama workspace sudah ditampilkan pemilih workspace).
- Impor `Textarea` yang tidak terpakai dan dependensi `useMemo` yang belum
  lengkap pada form invoice dibersihkan.
