# Model data

Sumber kebenaran: `supabase/migrations/20261013200530_initial_finance_schema.sql`.
Semua tabel domain memiliki `workspace_id` (kecuali `users`, `workspaces`,
`workspace_memberships`), dan RLS `force` aktif sehingga penulisan hanya dapat
terjadi lewat fungsi `SECURITY DEFINER`.

## Kelompok tabel

**Identitas & tenancy**

- `public.users` — identitas aplikasi (tanpa Supabase Auth); `email_normalized`
  unik, `password_hash` format `scrypt1$N,r,p$salt$hash`.
- `public.workspaces` — nama, zona waktu (IANA), template, `settings` jsonb,
  `archived_at`; `created_by`/`updated_by` mengarah ke `users`.
- `public.workspace_memberships` — peran (`owner`, `admin`, `finance`, `cashier`,
  `viewer`) + status; unik per (workspace, user); satu owner aktif per workspace.
- `app_private.sessions`, `app_private.password_reset_tokens`,
  `app_private.workspace_invitations`, `app_private.auth_rate_limits` — hanya
  menyimpan HMAC token (`^[0-9a-f]{64}$`), tidak pernah token asli.

**Master data**

- `public.categories` (kind `sale|income|expense`), `public.payment_methods`,
  `public.customers`, `public.products` + `public.product_unit_options`
  (konversi satuan `numeric(18,6)`), `public.cash_accounts` (kind
  `cash|bank|ewallet|other`), `public.document_counters` (nomor dokumen per
  workspace).

**Penjualan & piutang**

- `public.sales_invoices` — status `draft|final`, subtotal/diskon/biaya/total
  sebagai `public.idr_amount`, `due_date`, jejak `void` (baris tidak dihapus).
- `public.sales_invoice_lines` — kuantitas `numeric(18,6)`, harga satuan,
  diskon per baris (nominal atau basis poin).
- `public.invoice_void_events` — event pembatalan invoice.
- Fungsi `app_private.invoice_balances_as_of` menghitung saldo tagihan pada
  tanggal tertentu (dipakai piutang, aging, dan laporan).

**Pembayaran & kas**

- `public.payments` + `public.payment_allocations` — pembayaran dialokasikan ke
  satu atau lebih invoice; jumlah alokasi harus sama dengan nilai pembayaran.
- `public.financial_transactions` (kind `income|expense`),
  `public.cash_transfers` (dua leg + opsional biaya).
- `public.cash_movements` — buku besar kas: `opening`, `payment`, `income`,
  `expense`, `transfer_in`, `transfer_out`, `reversal`; indeks unik memastikan
  satu sumber menghasilkan maksimal satu pergerakan per jenis.
- `public.payment_reversals`, `public.financial_transaction_reversals`,
  `public.cash_transfer_reversals` — koreksi yang selalu menambah baris lawan,
  tidak menghapus.

**Jejak & idempotensi**

- `public.audit_events` — aksi penting per workspace dengan aktor dan entitas.
- `public.idempotency_requests` — kunci unik per (workspace, aktor, operasi,
  `request_key` uuid) + `payload_hash` SHA-256 kanonik; kunci yang sama dengan
  payload berbeda ditolak sebagai konflik.

## Aturan uang

- Domain `public.idr_amount`: `bigint` antara 0 dan 1.000.000.000.000.
- Pembulatan setengah ke atas ke rupiah penuh (`ROUND_HALF_UP` via Decimal.js).
- Diskon baris ≤ bruto baris; diskon invoice ≤ subtotal setelah diskon baris;
  tambahan biaya ditambahkan setelah diskon; total tidak pernah negatif.
- Kuantitas adalah desimal hingga 6 angka (`numeric(18,6)`), bukan uang.

## Invarian yang dijaga trigger (68 trigger)

- `guard_*`: kepemilikan workspace, referensi silang antar-tabel (mis. baris
  invoice harus milik invoice yang sama), status terkunci (invoice final tidak
  dapat diubah nilainya), dan larangan mutasi langsung pada tabel tertentu.
- `assert_*`: saldo tagihan, alokasi pembayaran, keseimbangan transfer,
  pergerakan kas, integritas finansial menyeluruh
  (`app_private.check_financial_integrity`).
- `stamp_record`: mengisi `created_by`/`updated_by` dari konteks sesi; `audit_record`
  menulis ke `public.audit_events`.
- `reject_mutation`: menolak perubahan pada baris yang sudah final/void kecuali
  lewat fungsi koreksi resmi.

Semua trigger bekerja pada transaksi yang telah memasang konteks sesi
(`app_private.set_context`), sehingga "siapa" tidak pernah datang dari klien.
