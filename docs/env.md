# Variabel lingkungan

Validasi runtime: `src/server/env.ts` (lazy — build tidak membutuhkan kredensial).
Pemeriksa untuk operator: `pnpm env:check [--mode=runtime|admin|setup]`.
Templat: `.env.example`. Nilai asli hanya di `.env.local` atau Environment
Variables Vercel — **jangan pernah** masuk repo.

## Runtime (Vercel, semua lingkungan)

| Variabel | Wajib | Aturan |
| --- | --- | --- |
| `APP_URL` | ya | origin http(s), dipakai untuk Origin/CSRF dan pembuatan tautan |
| `APP_ENV` | tidak | `local` (default), `preview`, `production` |
| `DATABASE_URL` | ya | PostgreSQL role `finance_runtime` (Transaction pooler, `prepare: false`) |
| `AUTH_TOKEN_PEPPER` | ya | 32 byte acak sebagai 64 karakter hex; tidak boleh dirotasi saat build |
| `DEFAULT_TIMEZONE` | tidak | nama IANA, default `Asia/Makassar` |
| `DATABASE_POOL_MAX` | tidak | 1–20, default 2 |
| `SESSION_ABSOLUTE_HOURS` | tidak | 1–720, default 168 |
| `SESSION_IDLE_HOURS` | tidak | 1–72, default 24 |
| `LOG_LEVEL` | tidak | `debug\|info\|warn\|error`, default `info` |

`NODE_ENV` tidak dipakai sebagai pengganti `APP_ENV` (pemisahan data dan guard
migrasi memakai `APP_ENV`).

## Hanya operator/lokal

| Variabel | Dipakai oleh |
| --- | --- |
| `DATABASE_ADMIN_URL` | `pnpm setup`, `bootstrap:owner`, `auth:reset`, `db:backup` — kredensial admin (BYPASSRLS). **Jangan** pasang di runtime Vercel |
| `DB_RUNTIME_PASSWORD` | `pnpm setup` (membuat/mengubah password role runtime) |
| `DATABASE_POOLER_URL` | template Transaction pooler tanpa password; `pnpm setup` menyisipkan password dan menulis `DATABASE_URL` |
| `OWNER_EMAIL` / `OWNER_NAME` / `OWNER_PASSWORD` | `pnpm bootstrap:owner` (tanpa prompt interaktif) |
| `PG_DUMP_BIN` / `PG_RESTORE_BIN` | `pnpm db:backup` bila binari tidak ada di `PATH` |

## Alur rahasia

1. `pnpm secrets:generate` menulis `.secrets/generated.env` (mode 600, diabaikan
   git) berisi `AUTH_TOKEN_PEPPER` dan `DB_RUNTIME_PASSWORD`.
2. `pnpm setup` menyetel password role `finance_runtime`, menyusun `DATABASE_URL`
   dari `DATABASE_POOLER_URL`, **menguji login** sebagai role tersebut, lalu
   memperbarui baris terkait di `.env.local` tanpa mengubah baris lain.
3. Di Vercel, isi nilainya lewat Environment Variables (terpisah untuk
   Preview/Production), bukan dari file.

## Rotasi

- **`DB_RUNTIME_PASSWORD`**: `pnpm setup -- --rotate-password`, lalu perbarui
  `DATABASE_URL` di Vercel. Hanya memutus sesi database, bukan sesi pengguna.
- **`AUTH_TOKEN_PEPPER`**: rotasi mencabut semua sesi, undangan, dan token reset
  yang masih berlaku (hash lama tidak lagi cocok). Lakukan saat jam sepi dan
  umumkan pengguna perlu masuk ulang. Lihat `docs/runbooks.md`.
- **Kata sandi pengguna**: `pnpm auth:reset -- --email=...` (tautan sekali pakai,
  berlaku 30 menit, mencabut seluruh sesi akun tersebut).
