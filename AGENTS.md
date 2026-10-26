# AGENTS.md — konvensi kerja di repositori ini

Ringkasan aturan yang harus diikuti siapa pun (manusia atau agen) yang mengubah
kode di repositori ini. Bahasa kode dan UI: Indonesia untuk teks pengguna,
Inggris untuk nama identifier.

## Perintah wajib sebelum mengakhiri pekerjaan

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build          # bila menyentuh rute/komponen
```

Semua harus lulus. Jangan menonaktifkan aturan lint, melemahkan assert, atau
melewati tes untuk membuat pemeriksaan hijau.

## Peta arsitektur

- `src/app/**` — App Router. Halaman server mengambil data lewat `src/server/dal`,
  bukan query ad-hoc. Rute privat berada di bawah `/w/[workspaceId]`.
- `src/modules/*/actions.ts` — Server Actions: `"use server"`, validasi Zod,
  `assertSameOrigin()`, ambil konteks sesi, lalu panggil service. Tidak ada logika
  bisnis di sini.
- `src/server/services/**` — logika domain + SQL. Semua fungsi menerima `tx: Tx`
  sebagai argumen pertama agar ikut transaksi pemanggil.
- `src/server/dal/**` — sesi, konteks workspace, helper paginasi/permintaan.
- `src/lib/**` — murni dan dapat diuji tanpa Node/DB (money, dates, invoice,
  csv, permissions, idempotency, schemas).
- `src/components/ui/**` — primitif UI tanpa dependensi luar.
- `supabase/migrations/**` — satu-satunya sumber kebenaran skema. Jangan memakai
  `drizzle push`/`migrate`; jalankan lewat Supabase CLI.
- `scripts/**` — perkakas operator (`node scripts/*.mjs`), memakai `scripts/lib/`.

## Invarian finansial

1. Rupiah adalah bilangan bulat: `bigint` di Node, `public.idr_amount` di DB.
   Aritmetika lewat `src/lib/money.ts` (Decimal.js). `parseFloat`/`Number` untuk
   uang dilarang oleh aturan lint.
2. Diskon dihitung dengan pembulatan `ROUND_HALF_UP` ke rupiah penuh; diskon
   baris dibatasi tidak melebihi bruto baris, diskon invoice tidak melebihi
   subtotal, dan total tidak pernah negatif (`src/lib/invoice.ts`).
3. Pembayaran tidak boleh melebihi saldo tagihan, dan jumlah alokasi harus sama
   dengan nilai pembayaran — ditegakkan di service **dan** constraint/trigger DB.
4. Setiap mutasi keuangan memakai `requestKey` idempotent
   (`src/lib/idempotency.ts` + `app_private.idempotency_requests`). Kunci harus
   stabil untuk payload yang sama dan berubah ketika payload berubah.
5. Koreksi (void, reversal) tidak pernah menghapus baris; selalu menambah event
   koreksi + pergerakan kas lawan.

## Tenancy & keamanan

- RLS adalah penentu izin akhir. `src/lib/permissions.ts` hanya menyalin
  `app_private.has_permission` untuk menyembunyikan navigasi/tombol.
- Semua query runtime memakai transaksi berkonteks
  (`runWithSession`/`runWithoutSession` di `src/server/dal/context.ts`). Jangan
  membaca `app.workspace_id` dari input klien.
- Server Action yang mengubah data wajib memanggil `assertSameOrigin()` dan
  `requirePermission(...)` sebelum menulis.
- Rahasia hanya dari `process.env` di server (`src/server/env.ts`). Jangan
  menulis kredensial ke file yang di-commit, ke log, atau ke respons.
- Pesan error ke pengguna tidak boleh membocorkan detail database; gunakan
  kelas error di `src/server/errors.ts`.

## Konvensi kode

- TypeScript strict, tanpa `any` implisit; tipe eksplisit untuk nilai domain
  (`bigint` untuk uang, `string` untuk tanggal `YYYY-MM-DD`). Tanggal "hari ini"
  selalu dihitung di zona waktu workspace (`src/lib/dates.ts`), bukan UTC.
- Nama file komponen `kebab-case.tsx`; komponen diekspor sebagai named export.
- Formulir klien memakai `useActionState` + hidden input `payload` (JSON) untuk
  payload kompleks, dan menampilkan kesalahan lewat `state.status === "error"`.
- Skrip operator: Node murni (`.mjs`), tanpa dependensi baru, tanpa mencetak
  rahasia (`scripts/lib/log.mjs` meredaksi otomatis), dan harus menutup koneksi.
- Angka uang di UI selalu lewat `formatIDR`; jumlah desimal lewat `formatQuantity`.
- Setiap perubahan perilaku menambah entri di `docs/changes.md`; keputusan
  arsitektur baru mendapat ADR di `docs/decisions/`.

## Tes

- Unit: `tests/unit/*.test.ts`, cepat, tanpa DB. Kalkulasi uang, tanggal,
  izin, CSV, dan idempotensi wajib punya tes.
- Paritas: `tests/unit/parity.test.ts` memastikan implementasi skrip operator
  sama dengan implementasi aplikasi (scrypt, HMAC token, validasi env).
- Integrasi/e2e membutuhkan `DATABASE_URL`; lewati bila tidak tersedia dan
  catat sebagai belum dijalankan, bukan lulus.
