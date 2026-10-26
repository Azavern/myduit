import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, Pagination, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { ReverseTransactionForm, ReverseTransferForm } from "@/components/cash/correction-forms";
import { TransactionForm, TransferForm } from "@/components/cash/transaction-forms";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PERIOD_PRESETS, resolvePeriod, todayInTimezone } from "@/lib/dates";
import { formatIDR } from "@/lib/money";
import { clampInt } from "@/lib/utils";
import { loadWorkspace } from "@/server/dal/page";
import { listTransactions, listTransfers } from "@/server/services/cash";
import { listCashAccounts, listCategories, listPaymentMethods } from "@/server/services/masters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transaksi Kas" };

const PAGE_SIZE = 25;

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const page = clampInt(sp.page, 1, 10_000, 1);

  const { context, data } = await loadWorkspace(workspaceId, async (tx, ctx) => {
    const range = resolvePeriod(sp.period, sp.from, sp.to, ctx.workspace.timezone);
    const today = todayInTimezone(ctx.workspace.timezone);
    const [transactions, transfers, accounts, methods, incomeCategories, expenseCategories] = await Promise.all([
      listTransactions(tx, workspaceId, {
        from: range.from,
        to: range.to,
        search: sp.q ?? null,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      listTransfers(tx, workspaceId, { from: range.from, to: range.to, limit: 25 }),
      listCashAccounts(tx, workspaceId, true),
      listPaymentMethods(tx, workspaceId, true),
      listCategories(tx, workspaceId, { kind: "income", activeOnly: true }),
      listCategories(tx, workspaceId, { kind: "expense", activeOnly: true }),
    ]);
    return { range, today, transactions, transfers, accounts, methods, incomeCategories, expenseCategories };
  });

  const canCash = context.role === "owner" || context.role === "admin" || context.role === "finance";

  const transactionColumns: ColumnSpec[] = [
    { key: "number", header: "Nomor" },
    { key: "business_date", header: "Tanggal", kind: "date" },
    {
      key: "kind",
      header: "Jenis",
      kind: "badge",
      badges: { income: { label: "Pemasukan", tone: "positive" }, expense: { label: "Pengeluaran", tone: "danger" } },
    },
    { key: "category_name", header: "Kategori" },
    { key: "account_name", header: "Akun" },
    { key: "description", header: "Deskripsi", muted: true },
    { key: "amount", header: "Nominal", kind: "money", align: "right" },
    { key: "state", header: "Status", kind: "badge", badges: { effective: { label: "Efektif", tone: "positive" }, reversed: { label: "Dikoreksi", tone: "warning" } } },
  ];

  const fields: FilterField[] = [
    { type: "select", name: "period", label: "Periode", options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) },
    { type: "date", name: "from", label: "Dari" },
    { type: "date", name: "to", label: "Sampai" },
    { type: "search", name: "q", label: "Cari nomor/deskripsi", placeholder: "TXN-2026…" },
  ];

  return (
    <>
      <PageHeader
        title="Transaksi Kas"
        description="Pemasukan/pengeluaran umum dan transfer antar akun. Pembayaran piutang dicatat melalui menu Pembayaran."
        actions={canCash ? undefined : (
          <span className="text-sm text-ink-muted">Peran Anda hanya dapat melihat data kas.</span>
        )}
      />

      {canCash ? (
        <div className="mb-4 grid gap-4">
          <details className="rounded-card border border-border-subtle bg-surface p-5" open={sp.new === "expense" || sp.new === "income"}>
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {sp.new === "income" ? "Tambah pemasukan" : "Tambah pengeluaran"}
            </summary>
            <div className="mt-4 space-y-6">
              <TransactionForm
                workspaceId={workspaceId}
                kind="expense"
                categories={data.expenseCategories.map((category) => ({ id: category.id, name: category.name }))}
                accounts={data.accounts.map((account) => ({ id: account.id, name: account.name }))}
                methods={data.methods.map((method) => ({ id: method.id, name: method.name }))}
                today={data.today}
              />
              <div className="border-t border-border-subtle pt-6">
                <TransactionForm
                  workspaceId={workspaceId}
                  kind="income"
                  categories={data.incomeCategories.map((category) => ({ id: category.id, name: category.name }))}
                  accounts={data.accounts.map((account) => ({ id: account.id, name: account.name }))}
                  methods={data.methods.map((method) => ({ id: method.id, name: method.name }))}
                  today={data.today}
                />
              </div>
            </div>
          </details>

          <details className="rounded-card border border-border-subtle bg-surface p-5" open={sp.new === "transfer"}>
            <summary className="cursor-pointer text-sm font-semibold text-ink">Transfer antar akun</summary>
            <div className="mt-4">
              <TransferForm
                workspaceId={workspaceId}
                accounts={data.accounts.map((account) => ({ id: account.id, name: account.name }))}
                expenseCategories={data.expenseCategories.map((category) => ({ id: category.id, name: category.name }))}
                today={data.today}
              />
            </div>
          </details>
        </div>
      ) : null}

      <FilterBar
        action={`/w/${workspaceId}/transactions`}
        fields={fields}
        values={{ period: sp.period, from: sp.from, to: sp.to, q: sp.q }}
        resetHref={`/w/${workspaceId}/transactions`}
      />

      <p className="mb-3 text-sm text-ink-muted">
        Pemasukan: <span className="tabular font-medium text-success">{formatIDR(data.transactions.incoming)}</span> · Pengeluaran:{" "}
        <span className="tabular font-medium text-danger">{formatIDR(data.transactions.outgoing)}</span>
      </p>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Pemasukan &amp; pengeluaran umum</CardTitle>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={transactionColumns}
            rows={data.transactions.rows.map((row) => ({
              id: row.id,
              number: row.number,
              business_date: row.business_date,
              kind: row.kind,
              category_name: row.category_name,
              account_name: row.account_name,
              description: row.description,
              amount: row.amount,
              state: row.reversed ? "reversed" : "effective",
            }))}
            emptyTitle="Belum ada transaksi kas"
            emptyDescription="Catat pemasukan atau pengeluaran umum pada periode ini."
          />
        </CardBody>
      </Card>

      {canCash && data.transactions.rows.length > 0 ? (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {data.transactions.rows
            .filter((row) => !row.reversed)
            .slice(0, 4)
            .map((row) => (
              <ReverseTransactionForm
                key={row.id}
                workspaceId={workspaceId}
                transactionId={row.id}
                label={`${row.number} (${formatIDR(row.amount)})`}
                today={data.today}
              />
            ))}
        </div>
      ) : null}

      <Pagination
        basePath={`/w/${workspaceId}/transactions`}
        query={{ period: sp.period, from: sp.from, to: sp.to, q: sp.q }}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.transactions.total}
      />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Transfer antar akun</CardTitle>
          <span className="text-xs text-ink-subtle">Dikecualikan dari pemasukan/pengeluaran operasional</span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={[
              { key: "number", header: "Nomor" },
              { key: "business_date", header: "Tanggal", kind: "date" },
              { key: "source_name", header: "Dari" },
              { key: "destination_name", header: "Ke" },
              { key: "amount", header: "Nominal", kind: "money", align: "right" },
              { key: "state", header: "Status", kind: "badge", badges: { effective: { label: "Efektif", tone: "positive" }, reversed: { label: "Dikoreksi", tone: "warning" } } },
            ]}
            rows={data.transfers.rows.map((row) => ({
              id: row.id,
              number: row.number,
              business_date: row.business_date,
              source_name: row.source_name,
              destination_name: row.destination_name,
              amount: row.amount,
              state: row.reversed ? "reversed" : "effective",
            }))}
            emptyTitle="Belum ada transfer"
            emptyDescription="Transfer antar akun akan tampil di sini."
          />
        </CardBody>
      </Card>

      {canCash && data.transfers.rows.some((row) => !row.reversed) ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.transfers.rows
            .filter((row) => !row.reversed)
            .slice(0, 4)
            .map((row) => (
              <ReverseTransferForm
                key={row.id}
                workspaceId={workspaceId}
                transferId={row.id}
                today={data.today}
              />
            ))}
        </div>
      ) : null}
    </>
  );
}
