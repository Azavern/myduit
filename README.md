# myduit

Aplikasi web pencatatan keuangan multiuser untuk usaha kecil: penjualan, piutang,
pembayaran, kas, dan laporan — satu database PostgreSQL (Supabase) dengan
isolasi data per workspace ditegakkan di level database.

Proyek pribadi nonkomersial. Bahasa antarmuka: Indonesia.

## Stack

| Lapisan | Pilihan |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions, React 19) |
| Database | PostgreSQL (Supabase) + RLS, tanpa ORM — SQL langsung lewat `postgres.js` |
| Validasi | Zod di batas server; state form memakai `useActionState` |
| Uang | `bigint` rupiah + `decimal.js` (tanpa floating point) |
| UI | Tailwind CSS v4 (`@theme` tokens) + primitif lokal di `src/components/ui` |
| Grafik | Recharts; tabel memakai TanStack Table |
| Tes | Vitest (unit) + Playwright (e2e, opsional) |

## Mulai cepat (lokal)

```bash
# 1. Dependensi
corepack enable && pnpm install        # atau: corepack pnpm install

# 2. Rahasia lokal (.secrets/generated.env, tidak pernah di-commit)
pnpm secrets:generate

# 3. Salin templat lingkungan lalu isi nilainya
cp .env.example .env.local             # APP_URL, DATABASE_ADMIN_URL, DATABASE_POOLER_URL

# 4. Migrasi + provisioning role runtime + susun DATABASE_URL
npx supabase start                     # PostgreSQL lokal (Docker)
pnpm setup -- --migrate

# 5. Akun pemilik pertama
pnpm bootstrap:owner -- --email=owner@contoh.id

# 6. Jalankan
pnpm env:check -- --mode=runtime
pnpm dev
```

Masuk di `/login`, lalu buat workspace pertama di `/onboarding` (template
workspace diterapkan otomatis: kategori, metode pembayaran, akun kas).

## Perintah

| Perintah | Kegunaan |
| --- | --- |
| `pnpm dev` | Server pengembangan |
| `pnpm build` / `pnpm start` | Build produksi dan menjalankannya |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (flat config, aturan Next.js + TypeScript) |
| `pnpm test` | Unit test (Vitest) |
| `pnpm test:integration` | Tes integrasi (butuh `DATABASE_URL`; dilewati bila kosong) |
| `pnpm test:e2e` | Playwright |
| `pnpm env:check [--mode=runtime\|admin\|setup]` | Validasi variabel lingkungan tanpa menampilkan nilainya |
| `pnpm secrets:generate` | Membuat `AUTH_TOKEN_PEPPER` + `DB_RUNTIME_PASSWORD` |
| `pnpm setup [-- --migrate] [-- --rotate-password]` | Provisioning role `finance_runtime`, menyusun & menguji `DATABASE_URL` |
| `pnpm bootstrap:owner -- --email=...` | Membuat/menyetel ulang akun owner pertama |
| `pnpm auth:reset -- --email=...` | Tautan reset kata sandi sekali pakai (30 menit) |
| `pnpm db:backup [-- --keep=14]` | `pg_dump` format custom + verifikasi `pg_restore --list` |

## Struktur

```
src/app                 Rute App Router (publik, /w/[workspaceId], /api)
src/components          UI: ui/ primitif, app/ kerangka, auth/, sales/, payments/, cash/, masters/
src/lib                 Utilitas murni: money, dates, invoice, csv, permissions, idempotency
src/modules/*/actions.ts  Server Actions per modul (validasi, konteks, pemanggilan service)
src/server              server-only: env, db, auth, dal, services, errors
supabase/migrations     Skema SQL kanonik (dijalankan oleh Supabase CLI)
scripts                 Skrip operator (setup, bootstrap, reset, backup, cek env)
tests/unit              Tes unit Vitest
docs                    Dokumentasi teknis (lihat docs/README.md)
```

## Aturan yang tidak boleh dilanggar

1. **Uang selalu integer rupiah.** Tidak ada `parseFloat`/`Number` untuk uang
   (`no-restricted-globals` di ESLint menegakkannya); gunakan `src/lib/money.ts`.
2. **Tenancy di level database.** Setiap query berjalan dalam transaksi yang
   memasang konteks sesi (`app.session_hash`, `app.workspace_id`) dan RLS adalah
   penentu akhir izin; `src/lib/permissions.ts` hanya untuk UI.
3. **Role runtime tidak boleh punya hak tinggi.** `finance_runtime` adalah role
   NOLOGIN tanpa `BYPASSRLS`; penulisan hanya lewat fungsi `SECURITY DEFINER`.
4. **Mutasi keuangan bersifat idempotent.** Setiap form mengirim `requestKey`
   (lihat `src/lib/idempotency.ts`) dan server memverifikasinya
   (`app_private.idempotency_requests`).
5. **Rahasia tidak pernah masuk repo atau log.** `.secrets/`, `.env.local`, dan
   dump backup tidak di-commit; skrip meredaksi nilai sensitif saat mencetak.

## Dokumentasi

- [docs/README.md](docs/README.md) — indeks dokumentasi
- [docs/progress.md](docs/progress.md) — status implementasi
- [docs/testing.md](docs/testing.md) — strategi dan cakupan tes
- [docs/data-model.md](docs/data-model.md) — skema & invarian
- [docs/permissions.md](docs/permissions.md) — matriks peran
- [docs/env.md](docs/env.md) — variabel lingkungan
- [docs/deployment.md](docs/deployment.md) — Supabase + Vercel
- [docs/runbooks.md](docs/runbooks.md) — operasi harian
- [docs/changes.md](docs/changes.md) — catatan perubahan
- [AGENTS.md](AGENTS.md) — konvensi untuk kontributor/agen otomatis
