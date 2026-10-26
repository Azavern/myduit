# ADR-0003 — Tenancy ditegakkan di database dengan satu role runtime terbatas

Status: diterima (2026-10-13)

## Konteks

Satu database menampung banyak workspace. Kebocoran data antar-workspace adalah
risiko paling serius untuk aplikasi keuangan multiuser. Jika penyaringan
`where workspace_id = ...` hanya ada di kode aplikasi, satu query yang lupa
menambahkannya sudah cukup untuk membocorkan data. Sebaliknya, aturan isolasi
yang tersebar di banyak lapisan sulit diuji dan mudah terlewat.

## Keputusan

1. **Role runtime terbatas.** Migrasi membuat `finance_runtime`:
   `NOLOGIN`, tanpa `SUPERUSER`/`CREATEDB`/`CREATEROLE`/`BYPASSRLS`/`INHERIT`.
   Migrasi juga memverifikasi dirinya dijalankan oleh pemilik ber-BYPASSRLS dan
   menolak jika `finance_runtime` ternyata memiliki hak istimewa atau memiliki
   objek.
2. **RLS paksa.** Semua tabel domain memakai `enable row level security` +
   `force row level security` dan mencabut hak dari `public`. Policy baca hanya
   untuk role runtime, dan hanya jika `app_private.has_permission(...)` benar.
3. **Penulisan lewat fungsi `SECURITY DEFINER`.** Runtime tidak punya DML
   langsung; mutasi dilakukan oleh fungsi `app_private.*` yang memeriksa izin,
   invarian, dan menulis audit.
4. **Konteks transaksi-lokal.** Setiap permintaan berjalan dalam satu transaksi
   yang lebih dulu memanggil `app_private.set_context(session_hash, workspace_id,
   request_id)`; fungsi `app_private.actor_id()` membaca `app.session_hash` dari
   GUC transaksi. Karena bersifat transaksi-lokal, konteks tidak pernah bocor ke
   permintaan berikutnya pada koneksi pooler yang sama.

## Konsekuensi

Positif: isolasi dan izin tidak dapat dilupakan oleh kode fitur baru; satu query
yang salah tetap tidak dapat membaca workspace lain; audit otomatis pada perubahan
penting.

Negatif: alur pengembangan menjadi lebih berat — setiap fitur tulis baru butuh
fungsi database, trigger, dan tes. Debugging memerlukan pemeriksaan konteks sesi.
Biaya ini diterima karena kesalahan pada data keuangan tidak dapat dibatalkan
dengan cepat.
