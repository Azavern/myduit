# Runbook operasi

## Migrasi

```bash
npx supabase start                      # database lokal
npx supabase migration up --local       # terapkan migrasi lokal
pnpm setup -- --migrate                 # provisioning role + uji DATABASE_URL
npx supabase db push                    # ke project tertaut (produksi)
```

- Selalu jalankan di lokal lebih dulu; migrasi dijalankan sebagai pemilik
  migrasi ber-BYPASSRLS (Supabase `postgres`).
- Setelah migrasi produksi, periksa `/api/health` dan buka dashboard.
- Migrasi tidak boleh menghapus data uang; koreksi selalu bersifat aditif.

## Backup

```bash
pnpm db:backup                       # sampai ./backups, retensi 14 hari
pnpm db:backup -- --keep=30
pnpm db:backup -- --schema-only      # hanya struktur
```

Skrip memakai `pg_dump --format=custom`, menyembunyikan connection string dari
`argv` (password dikirim lewat `PGPASSWORD` anak proses), lalu memverifikasi
dump dengan header `PGDMP` dan `pg_restore --list`. Simpan salinan di luar mesin
ini (object storage) — repositori tidak pernah menyimpan dump.

## Restore

```bash
# 1. Buat database tujuan yang kosong (jangan menimpa produksi secara langsung)
createdb restore_uji
# 2. Pulihkan
pg_restore --dbname="postgresql://postgres:***@host:5432/restore_uji" \
  --no-owner --no-privileges backups/myduit-<stamp>.dump
# 3. Verifikasi: jumlah baris tabel kunci dan integritas finansial
psql "postgresql://postgres:***@host:5432/restore_uji" \
  -c "select count(*) from public.sales_invoices" \
  -c "select app_private.check_financial_integrity()"
```

Setelah restore, jalankan `pnpm setup` untuk menyetel ulang password role
`finance_runtime` pada database tujuan (role adalah objek cluster-wide) dan
perbarui `DATABASE_URL` bila menunjuk database baru.

## Pemulihan akses

**Lupa kata sandi pengguna** — operator membuat tautan sekali pakai:

```bash
pnpm auth:reset -- --email=owner@contoh.id
# tautan berlaku 30 menit dan mencabut seluruh sesi akun tersebut
```

**Owner tidak dapat masuk dan tidak ada operator lain** — buat/menyetel ulang
akun owner lewat admin URL:

```bash
pnpm bootstrap:owner -- --email=owner@contoh.id --reset-password
```

**Menonaktifkan anggota** — dari UI Members (peran `members`): status anggota di
ubah menjadi `disabled`; sesi aktif pengguna tersebut dicabut oleh trigger
keamanan.

## Rotasi `AUTH_TOKEN_PEPPER`

Efeknya: semua sesi, undangan, dan token reset yang masih berlaku menjadi tidak
valid. Lakukan saat jam sepi.

1. `pnpm secrets:generate -- --force --rotate-pepper`
2. Perbarui `AUTH_TOKEN_PEPPER` di Environment Variables Vercel (Preview dan
   Production).
3. Deploy ulang, lalu umumkan bahwa pengguna perlu masuk kembali.
4. Verifikasi: sesi lama ditolak, login baru berhasil.

## Insiden: mencurigai kebocoran kredensial

1. Rotasi `DB_RUNTIME_PASSWORD` (`pnpm setup -- --rotate-password`) dan perbarui
   `DATABASE_URL` di Vercel.
2. Rotasi `AUTH_TOKEN_PEPPER` (lihat di atas) dan reset kata sandi akun terkait.
3. Periksa `public.audit_events` untuk aksi di luar kebiasaan dan
   `app_private.sessions` untuk sesi aktif yang tidak dikenal
   (`select * from app_private.sessions where revoked_at is null`).
4. Cabut sesi yang tidak dikenal:
   `update app_private.sessions set revoked_at = now() where id = '<id>';`
5. Catat waktu, temuan, dan tindakan di `docs/changes.md`.

## Pemeriksaan rutin

| Frekuensi | Tindakan |
| --- | --- |
| Harian | `/api/health`; tinjau log Vercel untuk error 5xx |
| Mingguan | `pnpm db:backup` ke penyimpanan eksternal; periksa retensi |
| Bulanan | `pnpm env:check -- --mode=runtime`; tinjau anggota & peran workspace |
| Per perubahan | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
