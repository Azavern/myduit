# Status implementasi

Terakhir diperbarui: 2026-10-14.

## Selesai

**Fondasi & keamanan**

- Skema PostgreSQL lengkap dalam satu migrasi: 27 tabel, 40 fungsi
  `app_private.*`, 68 trigger penjaga, RLS aktif + `force row level security`.
- Role runtime `finance_runtime` (NOLOGIN, tanpa `BYPASSRLS`); semua penulisan
  lewat fungsi `SECURITY DEFINER`; konteks sesi transaksi-lokal
  (`app.session_hash`, `app.workspace_id`).
- Autentikasi kredensial sendiri: scrypt (OWASP parameters), token sesi/undangan/
  reset disimpan hanya sebagai HMAC-SHA-256, rate limit per IP dan per identitas,
  pencabutan sesi saat kata sandi berubah.
- Idempotensi mutasi: `public.idempotency_requests` + `requestKey` yang diturunkan
  dari payload (`src/lib/idempotency.ts`).

**Aplikasi**

- Rute publik: `/`, `/login`, `/register` (penerimaan undangan), `/forgot-password`,
  `/reset-password`, `/onboarding`.
- Area workspace `/w/[workspaceId]`: dashboard, penjualan (daftar/baru/detail/edit),
  piutang + aging, pembayaran, pelanggan, produk & opsi satuan, akun kas,
  transaksi kas + transfer, kategori & metode, laporan, ekspor CSV, anggota,
  audit, pengaturan.
- Server Actions per modul dengan validasi Zod, pemeriksaan Origin, dan izin
  database; tabel data dengan pencarian/sortir/paginasi; grafik Recharts.
- `GET /api/health` untuk pemeriksaan ketersediaan.

**Perkakas & kualitas**

- Skrip operator: `env:check`, `secrets:generate`, `setup`, `bootstrap:owner`,
  `auth:reset`, `db:backup` (verifikasi `pg_restore --list`).
- Unit test Vitest (51 tes) termasuk tes paritas antara skrip operator dan
  implementasi aplikasi.
- CI GitHub Actions: install → typecheck → lint → test → build.

## Belum dikerjakan (usulan urutan)

1. **Tes integrasi database**: invarian saldo tagihan, idempotensi, dan isolasi
   antar-workspace terhadap PostgreSQL nyata (`tests/integration/`, dilewati
   tanpa `DATABASE_URL`). Perlu `supabase start` di lingkungan yang mendukung
   Docker.
2. **E2E Playwright** untuk alur kritis: masuk → buat workspace → buat invoice →
   catat pembayaran → laporan.
3. **Penerbitan PDF/nota** dan cetak struk.
4. **Impor data awal** (pelanggan/produk dari CSV) dengan pratinjau dan validasi.
5. **Rekonsiliasi bank** dan lampiran bukti (R2/Supabase Storage).
6. **Pemberitahuan jatuh tempo** via email (belum ada penyedia email terpasang).

## Catatan keterbatasan saat ini

- 1 peringatan lint yang diketahui: `react-hooks/incompatible-library` pada
  `useReactTable` (TanStack Table belum kompatibel dengan React Compiler).
- `pg_dump`/`pg_restore` serta Docker/Supabase CLI tidak tersedia di lingkungan
  pengembangan ini, sehingga `pnpm db:backup` dan migrasi nyata belum dijalankan
  di sini — hanya jalur validasi argumen/lingkungan yang sudah diuji.
- Skrip `pnpm setup`, `bootstrap:owner`, dan `auth:reset` belum diuji terhadap
  database sungguhan di lingkungan ini; jalur kesalahan (konfigurasi hilang,
  host tidak terjangkau) sudah diverifikasi beserta kode keluarnya.
