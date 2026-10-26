# Dokumentasi myduit

| Dokumen | Isi |
| --- | --- |
| [progress.md](progress.md) | Apa yang sudah jadi, apa yang belum, urutan berikutnya |
| [changes.md](changes.md) | Catatan perubahan yang dapat dibaca manusia |
| [testing.md](testing.md) | Strategi tes, cakupan, cara menjalankan, batasan |
| [data-model.md](data-model.md) | Tabel, relasi, invarian, dan aturan uang |
| [permissions.md](permissions.md) | Matriks peran/izin dan cara penegakannya |
| [env.md](env.md) | Variabel lingkungan, rahasia, dan rotasinya |
| [deployment.md](deployment.md) | Langkah Supabase + Vercel (preview & produksi) |
| [runbooks.md](runbooks.md) | Operasi: migrasi, backup/restore, reset akses, insiden |
| [decisions/](decisions/) | ADR: keputusan arsitektur beserta alasannya |

## Prinsip produk

1. Satu pengguna tidak boleh pernah melihat data workspace lain — ditegakkan di
   database, bukan hanya di aplikasi.
2. Angka harus dapat dipertanggungjawabkan: tidak ada pembulatan mengambang,
   setiap perubahan dapat diaudit, koreksi bersifat aditif.
3. Operasi yang mengubah uang harus aman diulang (idempotent).
4. Antarmuka berbahasa Indonesia, angka rupiah penuh, zona waktu workspace.
5. Tanpa dependensi yang tidak diperlukan: SQL langsung, primitif UI lokal.
