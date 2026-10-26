export class AppError extends Error {
  readonly userMessage: string;
  readonly status: number;
  constructor(userMessage: string, status = 400, internal?: string) {
    super(internal ?? userMessage);
    this.name = "AppError";
    this.userMessage = userMessage;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors?: Record<string, string>;
  constructor(userMessage: string, fieldErrors?: Record<string, string>) {
    super(userMessage, 422);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class AuthError extends AppError {
  constructor(userMessage: string) {
    super(userMessage, 401);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(userMessage = "Anda tidak memiliki izin untuk tindakan ini.") {
    super(userMessage, 403);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(userMessage: string) {
    super(userMessage, 409);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends AppError {
  constructor(userMessage = "Data tidak ditemukan.") {
    super(userMessage, 404);
    this.name = "NotFoundError";
  }
}

/** PostgreSQL error codes raised by the canonical migration guards. */
const PG_MESSAGES: Record<string, string> = {
  "23505": "Data dengan nilai unik yang sama sudah ada.",
  "23514": "Aturan data atau aturan keuangan menolak operasi ini.",
  "23503": "Data terkait tidak ditemukan atau masih dipakai.",
  "28000": "Sesi atau kredensial tidak valid.",
  "42501": "Anda tidak memiliki izin untuk tindakan ini.",
};

const GUARD_MESSAGES: { match: RegExp; message: string }[] = [
  { match: /Final invoice is immutable/i, message: "Dokumen final tidak dapat diubah. Gunakan void dan dokumen pengganti." },
  { match: /Final invoice lines are immutable/i, message: "Baris dokumen final tidak dapat diubah." },
  { match: /Final invoice cannot be deleted/i, message: "Dokumen final tidak dapat dihapus." },
  { match: /Cashier cannot override price/i, message: "Kasir tidak dapat mengubah harga." },
  { match: /Cashier cannot backdate/i, message: "Kasir tidak dapat mencatat tanggal mundur." },
  { match: /Price override requires a reason/i, message: "Perubahan harga wajib disertai alasan." },
  { match: /over-allocation/i, message: "Alokasi melebihi sisa tagihan." },
  { match: /Invoice over-allocation/i, message: "Alokasi melebihi sisa tagihan." },
  { match: /Payment must be fully allocated/i, message: "Jumlah alokasi harus sama dengan nominal pembayaran." },
  { match: /Credit invoice requires customer and due date/i, message: "Tagihan bersisa wajib memiliki pelanggan dan jatuh tempo." },
  { match: /Future financial business dates/i, message: "Tanggal transaksi di masa depan belum didukung." },
  { match: /Invalid or expired session/i, message: "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali." },
  { match: /Workspace access denied/i, message: "Anda tidak memiliki akses ke workspace ini." },
  { match: /Invalid invitation/i, message: "Tautan undangan tidak valid atau sudah kedaluwarsa." },
  { match: /Invalid reset token/i, message: "Tautan reset tidak valid atau sudah kedaluwarsa." },
  { match: /Role escalation denied/i, message: "Perubahan peran tersebut tidak diizinkan." },
  { match: /must have exactly one active owner/i, message: "Workspace harus memiliki tepat satu owner aktif." },
  { match: /Login with the invited account required/i, message: "Silakan masuk dengan akun yang diundang." },
  { match: /requires one opening movement/i, message: "Akun kas wajib memiliki satu saldo awal (boleh nol)." },
  { match: /Idempotency/i, message: "Permintaan duplikat terdeteksi." },
  { match: /append-only/i, message: "Data ini bersifat append-only dan tidak dapat diubah atau dihapus." },
];

type PgError = { code?: string; message?: string; constraint_name?: string };

export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  if (typeof error === "object" && error !== null) {
    const pg = error as PgError;
    const raw = pg.message ?? "";
    for (const guard of GUARD_MESSAGES) {
      if (guard.match.test(raw)) return guard.message;
    }
    if (pg.code && PG_MESSAGES[pg.code]) return PG_MESSAGES[pg.code] as string;
  }
  return "Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.";
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
