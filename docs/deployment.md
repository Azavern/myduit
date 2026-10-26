# Deployment (Supabase + Vercel)

Aplikasi ini adalah aplikasi Next.js mandiri: database adalah PostgreSQL biasa
(Supabase hanya menyediakan hosting + pooler). Tidak ada Supabase Auth, tidak ada
kunci `service_role` di runtime, dan tidak ada akses database dari browser.

## 1. Database

1. Buat project Supabase (satu project dapat menampung preview dan produksi
   selama Anda memisahkan datanya; untuk keamanan data nyata gunakan project
   terpisah).
2. Terapkan migrasi sebagai pemilik migrasi (BYPASSRLS):
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   Migrasi membuat `app_private`, seluruh tabel domain, fungsi `SECURITY DEFINER`,
   trigger penjaga, RLS, dan role `finance_runtime` (NOLOGIN).
3. Setel password role runtime dan susun `DATABASE_URL`:
   ```bash
   DATABASE_ADMIN_URL=... DATABASE_POOLER_URL=... DB_RUNTIME_PASSWORD=... pnpm setup
   ```
   Perintah ini menyetel `LOGIN PASSWORD` untuk `finance_runtime` dan **menguji**
   koneksi runtime (`select current_user`) sebelum menulis `.env.local`.
4. Buat akun pemilik pertama: `pnpm bootstrap:owner -- --email=owner@contoh.id`.
   Workspace pertama dibuat dari `/onboarding` supaya preset template diterapkan.

## 2. Vercel

Set Environment Variables terpisah untuk **Preview** dan **Production**:

| Variabel | Catatan |
| --- | --- |
| `APP_URL` | origin HTTPS deployment (`https://app.contoh.id`) — dipakai validasi Origin |
| `APP_ENV` | `preview` atau `production` |
| `DATABASE_URL` | Transaction pooler role `finance_runtime` (port 6543), sertakan `sslmode=require` |
| `AUTH_TOKEN_PEPPER` | 64 karakter hex; **berbeda** untuk preview dan produksi |
| `DEFAULT_TIMEZONE` | opsional |
| `DATABASE_POOL_MAX` | mulai dari 2 untuk mode serverless |
| `LOG_LEVEL` | `info` |

`DATABASE_ADMIN_URL` dan `DB_RUNTIME_PASSWORD` **tidak** dipasang di Vercel;
keduanya hanya dipakai dari mesin operator.

Karena pooler Supabase berjalan dalam mode transaction pooling, klien memakai
`prepare: false` (sudah diatur di `src/server/db/client.ts`). Jangan mengaktifkan
prepared statements.

## 3. Setelah deploy

1. `curl https://<origin>/api/health` — harus mengembalikan status sehat.
2. Masuk dengan akun owner, buat workspace, dan periksa alur utama.
3. Periksa bahwa cookie sesi memakai nama `__Host-finance_session` (hanya ketika
   `APP_URL` berprotokol https) dan `HttpOnly`/`SameSite=Lax`.
4. Uji isolasi: buat akun kedua lewat undangan dari anggota, pastikan data
   workspace pertama tidak terlihat.

## 4. Migrasi lanjutan

```bash
supabase migration new <nama>     # membuat file migrasi baru
supabase db push                  # menerapkan ke project tertaut
```

Selalu uji migrasi di database lokal (`supabase start`) sebelum produksi. Perubahan
yang menghapus/mengubah kolom uang harus menjaga domain `public.idr_amount` dan
trigger `assert_*` tetap konsisten.

## 5. Rollback aplikasi

Deployment Vercel dapat di-rollback ke build sebelumnya dari dashboard. Untuk
database, rollback berarti menjalankan migrasi perbaikan ke depan (forward-fix);
jangan mengandalkan `db reset` pada data nyata — gunakan `docs/runbooks.md`.
