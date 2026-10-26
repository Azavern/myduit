# ADR-0005 — Idempotensi mutasi dengan kunci turunan payload

Status: diterima (2026-10-14)

## Konteks

Formulir keuangan dikirim lewat Server Action. Koneksi seluler yang buruk,
pengguna yang menekan tombol dua kali, atau retry otomatis dapat membuat invoice
atau pembayaran ganda. Meminta pengguna memeriksa dan menghapus duplikat tidak
dapat diterima untuk data keuangan.

## Keputusan

Setiap mutasi keuangan mengirim `requestKey` (uuid) di dalam payload:

- Server mengklaim kunci di `public.idempotency_requests` dengan
  `unique (workspace_id, actor_id, operation, request_key)` di dalam transaksi
  yang sama dengan operasinya. Kunci yang sama dengan `payload_hash` yang sama
  mengembalikan hasil sebelumnya (replay); `payload_hash` yang berbeda ditolak
  sebagai konflik.
- Klien menurunkan kunci saat render (`useRequestKey` →
  `src/lib/idempotency.ts`): kombinasi **nonce acak per instance form** dengan
  **hash dari tanda tangan payload**. Konsekuensinya:
  - payload tidak berubah → kunci sama → retry tidak menggandakan dokumen;
  - payload berubah (pengguna memperbaiki input lalu mengirim ulang) → kunci
    baru → permintaan tidak tertolak sebagai konflik;
  - instance form baru (dua dokumen identik yang memang disengaja) → kunci
    berbeda → keduanya tercatat.
- Kunci diturunkan secara sinkron tanpa efek samping, sehingga tidak memerlukan
  `useEffect`/setState (menghindari render berantai dan aturan
  `react-hooks/set-state-in-effect`).

## Alternatif yang ditolak

- **UUID per mount saja**: mengirim ulang setelah memperbaiki input akan
  bertabrakan dengan `payload_hash` lama dan ditolak sebagai konflik.
- **Hash payload saja tanpa nonce**: dua dokumen identik yang sah (mis. dua
  penjualan tunai dengan isi sama pada hari yang sama) akan dianggap duplikat.
- **Token sekali pakai dari server (halaman nonce)**: menambah round-trip dan
  state penyimpanan; payload-derived key sudah cukup karena payload itu sendiri
  yang harus unik per dokumen.

## Konsekuensi

Klien harus menyertakan `requestKey` pada setiap payload mutasi uang; skema Zod
memvalidasinya sebagai uuid. `tests/unit/idempotency.test.ts` menjaga sifat-sifat
di atas, dan kunci selalu terlihat di payload yang tersimpan pada
`idempotency_requests` untuk penelusuran.
