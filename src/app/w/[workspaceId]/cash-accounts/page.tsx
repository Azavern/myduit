import Link from "next/link";

import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { CashAccountForm } from "@/components/masters/cash-account-form";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateID, todayInTimezone } from "@/lib/dates";
import { formatIDR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { loadWorkspace } from "@/server/dal/page";
import { listCashAccounts } from "@/server/services/masters";
import { listCashMovements } from "@/server/services/cash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun Kas" };

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Saldo awal",
  payment: "Penerimaan",
  income: "Pemasukan",
  expense: "Pengeluaran",
  transfer_in: "Transfer masuk",
  transfer_out: "Transfer keluar",
  reversal: "Koreksi",
};

export default async function CashAccountsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;

  const { context, data } = await loadWorkspace(workspaceId, async (tx, ctx) => {
    const accounts = await listCashAccounts(tx, workspaceId, false);
    const movements = await listCashMovements(tx, workspaceId, { limit: 40 });
    return { accounts, movements, today: todayInTimezone(ctx.workspace.timezone) };
  });

  const canManage = can(context.role, "master");
  const totalBalance = data.accounts.reduce((sum, account) => sum + BigInt(account.balance), 0n);

  const movementColumns: ColumnSpec[] = [
    { key: "business_date", header: "Tanggal", kind: "date" },
    { key: "account_name", header: "Akun" },
    { key: "kind", header: "Jenis", kind: "badge", badges: movementBadges() },
    { key: "signed_amount", header: "Nilai", kind: "money", align: "right" },
    { key: "description", header: "Keterangan", muted: true },
  ];

  return (
    <>
      <PageHeader
        title="Akun Kas"
        description="Saldo dihitung dari seluruh pergerakan kas termasuk saldo awal. Saldo tidak diedit manual; koreksi memakai transaksi pembalikan."
        actions={
          <Link
            href={`/w/${workspaceId}/transactions`}
            className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Transaksi Kas
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.accounts.map((account) => (
          <div key={account.id} className="rounded-card border border-border-subtle bg-surface px-5 py-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">{account.name}</p>
                <p className="text-xs text-ink-subtle">
                  {account.kind} · dibuka {formatDateID(account.opening_date)}
                </p>
              </div>
              <span
                className={
                  account.active
                    ? "rounded-full border border-emerald-200 bg-success-surface px-2 py-0.5 text-xs font-medium text-success"
                    : "rounded-full border border-border-subtle bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted"
                }
              >
                {account.active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
            <p className="tabular mt-3 text-lg font-semibold text-ink">{formatIDR(account.balance)}</p>
          </div>
        ))}
        {data.accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-subtle px-5 py-6 text-sm text-ink-muted sm:col-span-2 xl:col-span-3">
            Belum ada akun kas. Tambahkan akun pertama beserta saldo awalnya.
          </p>
        ) : null}
      </div>

      <p className="mb-4 text-sm text-ink-muted">
        Total saldo seluruh akun: <span className="tabular font-semibold text-ink">{formatIDR(totalBalance)}</span>
      </p>

      {canManage ? (
        <details className="mb-4 rounded-card border border-border-subtle bg-surface p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Tambah akun kas</summary>
          <div className="mt-4">
            <CashAccountForm workspaceId={workspaceId} today={data.today} />
          </div>
        </details>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Mutasi terbaru</CardTitle>
          <span className="text-xs text-ink-subtle">Ledger kas bersifat append-only</span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={movementColumns}
            rows={data.movements.map((movement) => ({
              id: movement.id,
              business_date: movement.business_date,
              account_name: movement.account_name,
              kind: movement.kind,
              signed_amount: movement.signed_amount,
              description: movement.description ?? "",
            }))}
            emptyTitle="Belum ada mutasi kas"
            emptyDescription="Penerimaan pembayaran dan transaksi kas akan muncul di sini."
          />
        </CardBody>
      </Card>
    </>
  );
}

function movementBadges(): Record<string, { label: string; tone: "neutral" | "info" | "positive" | "warning" | "danger" | "brand" }> {
  return {
    opening: { label: MOVEMENT_LABELS.opening ?? "Saldo awal", tone: "neutral" },
    payment: { label: MOVEMENT_LABELS.payment ?? "Penerimaan", tone: "positive" },
    income: { label: MOVEMENT_LABELS.income ?? "Pemasukan", tone: "positive" },
    expense: { label: MOVEMENT_LABELS.expense ?? "Pengeluaran", tone: "danger" },
    transfer_in: { label: MOVEMENT_LABELS.transfer_in ?? "Transfer masuk", tone: "info" },
    transfer_out: { label: MOVEMENT_LABELS.transfer_out ?? "Transfer keluar", tone: "warning" },
    reversal: { label: MOVEMENT_LABELS.reversal ?? "Koreksi", tone: "brand" },
  };
}
