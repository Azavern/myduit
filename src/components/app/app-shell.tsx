import Link from "next/link";

import { WorkspaceNav } from "@/components/app/workspace-nav";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { Badge } from "@/components/ui/badge";
import { can, ROLE_LABELS, type MembershipRole, type Permission } from "@/lib/permissions";
import { logoutAction } from "@/modules/auth/actions";
import type { WorkspaceSummary } from "@/server/dal/session";

const NAV: { href: string; label: string; permission: Permission; group: "operasional" | "laporan" | "pengaturan" }[] = [
  { href: "dashboard", label: "Dashboard", permission: "read", group: "operasional" },
  { href: "sales", label: "Penjualan", permission: "sales", group: "operasional" },
  { href: "receivables", label: "Piutang", permission: "reports", group: "operasional" },
  { href: "payments", label: "Pembayaran", permission: "payments", group: "operasional" },
  { href: "customers", label: "Pelanggan", permission: "customers", group: "operasional" },
  { href: "products", label: "Produk/Jasa", permission: "master", group: "operasional" },
  { href: "transactions", label: "Transaksi Kas", permission: "cash", group: "operasional" },
  { href: "cash-accounts", label: "Akun Kas", permission: "read", group: "operasional" },
  { href: "reports", label: "Laporan", permission: "reports", group: "laporan" },
  { href: "categories", label: "Kategori & Metode", permission: "master", group: "pengaturan" },
  { href: "members", label: "Anggota", permission: "members", group: "pengaturan" },
  { href: "audit", label: "Audit", permission: "audit", group: "pengaturan" },
  { href: "settings", label: "Pengaturan", permission: "settings", group: "pengaturan" },
];

export function AppShell({
  workspaceId,
  timezone,
  archived,
  role,
  profile,
  workspaces,
  children,
}: {
  workspaceId: string;
  timezone: string;
  archived: boolean;
  role: MembershipRole;
  profile: { displayName: string; email: string };
  workspaces: WorkspaceSummary[];
  children: React.ReactNode;
}) {
  const items = NAV.filter((item) => can(role, item.permission));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-border-subtle bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/onboarding" className="text-lg font-semibold text-brand-800">
              myduit
            </Link>
            <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
          </div>

          <WorkspaceSwitcher currentWorkspaceId={workspaceId} workspaces={workspaces} />

          {archived ? (
            <p className="rounded-lg border border-amber-200 bg-warning-surface px-3 py-2 text-xs text-warning">
              Workspace ini diarsipkan. Data hanya dapat dilihat.
            </p>
          ) : null}

          <WorkspaceNav
            workspaceId={workspaceId}
            groups={["operasional", "laporan", "pengaturan"]}
            items={items.map((item) => ({ href: item.href, label: item.label, group: item.group }))}
          />

          <div className="mt-auto space-y-2 border-t border-border-subtle pt-4">
            <div>
              <p className="truncate text-sm font-medium text-ink">{profile.displayName}</p>
              <p className="truncate text-xs text-ink-subtle">{profile.email}</p>
              <p className="mt-1 text-xs text-ink-subtle">Zona waktu: {timezone}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-left text-sm font-medium text-ink-muted hover:bg-brand-50"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 bg-canvas px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
