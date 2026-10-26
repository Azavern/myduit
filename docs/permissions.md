# Peran dan izin

## Peran

| Peran | Ringkas |
| --- | --- |
| `owner` | Kontrol penuh, satu-satunya peran yang dapat mengalihkan kepemilikan |
| `admin` | Operasional + konfigurasi workspace & anggota |
| `finance` | Transaksi keuangan, koreksi, laporan, ekspor, audit |
| `cashier` | Membuat penjualan & mencatat pembayaran |
| `viewer` | Melihat data & laporan |

Satu workspace selalu memiliki tepat satu owner aktif (indeks unik parsial
`memberships_one_active_owner`), dan peran `owner` tidak dapat diberikan lewat
undangan.

## Matriks izin

| Izin | owner | admin | finance | cashier | viewer |
| --- | :-: | :-: | :-: | :-: | :-: |
| `read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `sales` / `customers` / `payments` | ✓ | ✓ | ✓ | ✓ | — |
| `master` (produk, kategori, akun kas) | ✓ | ✓ | ✓ | — | — |
| `cash` / `reverse` / `audit` / `export` | ✓ | ✓ | ✓ | — | — |
| `reports` | ✓ | ✓ | ✓ | — | ✓ |
| `members` / `settings` | ✓ | ✓ | — | — | — |
| `owner` | ✓ | — | — | — | — |

Catatan: workspace yang diarsipkan hanya mengizinkan `read`, `audit`, dan
`export` — operasi tulis ditolak walaupun perannya owner.

## Tiga lapisan penegakan

1. **Database (otoritatif)** — `app_private.has_permission(workspace, permission)`
   dipakai oleh RLS policy dan oleh setiap fungsi mutasi. Pemeriksaan selalu
   dikaitkan dengan `app.workspace_id` transaksi, sehingga izin tidak dapat
   dipalsukan lewat parameter.
2. **Server** — Server Action memanggil `requirePermission(...)` di
   `src/server/services/workspaces.ts` sebelum menulis, lalu tetap menjalankan
   operasi lewat fungsi database yang memeriksa ulang.
3. **UI (kosmetik)** — `src/lib/permissions.ts` menyembunyikan menu dan tombol.
   Kegagalannya hanya berarti tombol terlihat, bukan akses diberikan.

## Konsekuensi penegakan

- Mengubah peran/status anggota (`app_private.set_membership`) memverifikasi
  aktor memiliki izin `members`, tidak dapat menurunkan owner terakhir, dan
  menulis jejak ke `public.audit_events`.
- Pengalihan kepemilikan hanya lewat `app_private.transfer_owner`, yang
  memastikan owner baru adalah anggota aktif dan owner lama diturunkan.
- Setiap perubahan kata sandi mencabut seluruh sesi pengguna tersebut
  (`app_private.revoke_sessions_on_security_change`).
