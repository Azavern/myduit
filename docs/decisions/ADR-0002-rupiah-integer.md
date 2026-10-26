# ADR-0002 — Rupiah sebagai bilangan bulat + Decimal.js

Status: diterima (2026-10-13)

## Konteks

Aplikasi mencatat penjualan dengan kuantitas desimal (mis. 1,5 kg), harga
satuan, diskon persen, dan pembayaran yang dialokasikan ke beberapa tagihan.
Kesalahan pembulatan sekecil satu rupiah pada dokumen keuangan merusak
kepercayaan dan membuat rekonsiliasi mustahil. JavaScript `number` adalah
floating point biner: `0.1 + 0.2 !== 0.3`, dan `Number` kehilangan presisi pada
nominal besar.

## Keputusan

- Semua nilai uang disimpan dan dihitung sebagai **bilangan bulat rupiah**:
  `bigint` di Node, `bigint` dengan domain `public.idr_amount` (0 … 10^12) di
  PostgreSQL.
- Perhitungan yang melibatkan kuantitas/harga desimal memakai **Decimal.js**
  (`src/lib/money.ts`) dengan `ROUND_HALF_UP` dan presisi 40; hasil dikembalikan
  sebagai `bigint` dengan `roundToRupiah`.
- Kuantitas disimpan sebagai `numeric(18,6)` dan divalidasi terpisah dari uang.
- ESLint melarang `parseFloat` global (`no-restricted-globals`); input pengguna
  diparse lewat `parseIDRInput`/`parseIDRInputAllowZero` (hanya digit, batas
  nominal).
- Format tampilan hanya di lapisan presentasi (`formatIDR`, `formatQuantity`,
  `formatIDRFromNumeric` untuk kolom `numeric` dari PostgreSQL).

## Konsekuensi

Positif: aritmetika eksak dan dapat direproduksi; aturan pembulatan tunggal
teruji (`tests/unit/money.test.ts`); nilai dari PostgreSQL tidak pernah melewati
floating point.

Negatif: `bigint` tidak dapat dicampur dengan `Number` sehingga konversi harus
eksplisit; JSON tidak mendukung `bigint`, jadi payload API memakai string dan
`src/lib/schemas.ts` memvalidasinya sebagai string digit.
