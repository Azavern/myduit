# ADR-0004 — Tailwind v4 `@theme` + primitif UI lokal

Status: diterima (2026-10-13)

## Konteks

Antarmuka harus konsisten, ramah angka (tabel nominal), dan mudah dirawat oleh
satu pengembang. Pilihan: pustaka komponen siap pakai (mis. komponen shadcn yang
disalin, Radix, MUI) atau sekumpulan kecil primitif lokal di atas Tailwind.

Kebutuhan nyata aplikasi ini terbatas: tombol, kartu, kolom formulir, badge,
tabel, dan grafik. Banyak pustaka komponen membawa runtime, tema, dan konvensi
tambahan yang harus diikuti, serta menambah permukaan pembaruan keamanan.

## Keputusan

- Design token didefinisikan sekali di `src/app/globals.css` memakai blok `@theme`
  Tailwind v4 (palet `brand-*`, warna semantik `success/warning/danger/info`,
  `canvas/surface`, radius dan bayangan). Tidak ada nilai warna lepas di
  komponen.
- Primitif UI lokal di `src/components/ui/` (`button`, `card`, `field`, `badge`,
  `table`) tanpa dependensi runtime tambahan; varian memakai
  `class-variance-authority`, penggabungan kelas memakai `cn` (`clsx` +
  `tailwind-merge`).
- Nominal uang memakai kelas `tabular` (angka tabular) agar kolom sejajar.
- Grafik memakai Recharts dan tabel interaktif memakai TanStack Table, keduanya
  terpasang dan diisolasi di `src/components/app/`.
- Menghormati `prefers-reduced-motion` secara global.

## Konsekuensi

Positif: bundel kecil, kontrol penuh atas aksesibilitas dan tata letak, perubahan
tema satu tempat, tidak ada pembaruan pihak ketiga yang memaksa refactor.

Negatif: pola aksesibilitas sulit (dialog, combobox, date picker) harus dibangun
atau ditambahkan saat dibutuhkan. TanStack Table melaporkan peringatan
`react-hooks/incompatible-library` karena belum kompatibel dengan React Compiler
(diketahui, hanya peringatan).
