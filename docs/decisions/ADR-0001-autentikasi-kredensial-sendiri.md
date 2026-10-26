# ADR-0001 — Autentikasi kredensial sendiri dengan token HMAC

Status: diterima (2026-10-13)

## Konteks

Aplikasi multiuser ini butuh identitas pengguna, sesi, undangan anggota, dan
reset kata sandi. Pilihan yang tersedia: memakai penyedia identitas pihak ketiga
(Supabase Auth) atau mengelola kredensial sendiri di tabel aplikasi.

Pengguna aplikasi adalah pemilik usaha kecil dengan satu akun per orang, tanpa
kebutuhan SSO, MFA organisasi, atau integrasi identitas eksternal. Alur yang
paling penting: operator membuat akun pertama, pemilik mengundang staf.

## Keputusan

Menyimpan identitas di `public.users` dan menangani autentikasi sendiri:

- Kata sandi di-hash dengan scrypt (`N=131072, r=8, p=1`, kunci 64 byte, salt 16
  byte) dan disimpan sebagai `scrypt1$N,r,p$salt$hash` (`base64url`).
- Verifikasi memakai `timingSafeEqual`; email tak dikenal tetap diverifikasi
  terhadap hash dummy agar waktu respons serupa.
- Token sesi/undangan/reset dibuat acak 32 byte dan **hanya** disimpan sebagai
  HMAC-SHA-256 berpepper dengan domain terpisah (`session.v1`, `invitation.v1`,
  `reset.v1`, `ratelimit.v1`).
- Rate limit login ganda (per IP dan per identitas) di dalam database.
- Registrasi hanya lewat undangan; akun pertama dibuat operator
  (`pnpm bootstrap:owner`).

## Konsekuensi

Positif: tidak ada ketergantungan pada penyedia identitas; seluruh aturan izin
berada di satu database sehingga RLS dapat menegakkannya; tidak ada kunci
`service_role` yang harus dipegang aplikasi.

Negatif: tanggung jawab keamanan ada pada proyek ini — parameter scrypt, rotasi
pepper, dan pencabutan sesi harus dijaga. Tidak ada MFA bawaan. Rotasi
`AUTH_TOKEN_PEPPER` mencabut semua sesi (didokumentasikan di `docs/runbooks.md`).
