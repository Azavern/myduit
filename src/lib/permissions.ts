export type MembershipRole = "owner" | "admin" | "finance" | "cashier" | "viewer";

export type Permission =
  | "read"
  | "sales"
  | "customers"
  | "master"
  | "cash"
  | "payments"
  | "reverse"
  | "audit"
  | "export"
  | "reports"
  | "members"
  | "settings"
  | "owner";

/**
 * Mirrors `app_private.has_permission` for navigation and button gating only.
 * The database function remains the authoritative check on every operation.
 */
export function can(role: MembershipRole, permission: Permission): boolean {
  switch (permission) {
    case "read":
      return true;
    case "sales":
    case "customers":
    case "payments":
      return role === "owner" || role === "admin" || role === "finance" || role === "cashier";
    case "master":
      return role === "owner" || role === "admin" || role === "finance";
    case "cash":
    case "reverse":
    case "audit":
    case "export":
      return role === "owner" || role === "admin" || role === "finance";
    case "reports":
      return role === "owner" || role === "admin" || role === "finance" || role === "viewer";
    case "members":
    case "settings":
      return role === "owner" || role === "admin";
    case "owner":
      return role === "owner";
    default:
      return false;
  }
}

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  finance: "Finance",
  cashier: "Kasir",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<MembershipRole, string> = {
  owner: "Kontrol penuh termasuk pengaturan dan kepemilikan workspace.",
  admin: "Operasional dan konfigurasi; tidak dapat mengambil alih kepemilikan.",
  finance: "Mengelola transaksi keuangan, koreksi, dan laporan.",
  cashier: "Membuat penjualan dan mencatat pembayaran tanpa mengubah harga.",
  viewer: "Hanya melihat data dan laporan yang diizinkan.",
};
