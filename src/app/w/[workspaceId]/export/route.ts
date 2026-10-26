import { NextResponse } from "next/server";

import { csvFileName, MAX_EXPORT_ROWS, toCsv } from "@/lib/csv";
import { resolvePeriod, todayInTimezone } from "@/lib/dates";
import { tryLoadWorkspace } from "@/server/dal/page";
import { getCashFlow, getReceipts, getSalesReport } from "@/server/services/reports";

export const dynamic = "force-dynamic";

const EXPORT_TYPES = new Set(["sales", "cash-flow", "receipts"]);

/**
 * CSV export for report pages. Read-only, tenant-scoped (the workspace context
 * is derived from the session, never from the query string) and capped at
 * MAX_EXPORT_ROWS so a large workspace cannot exhaust memory.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  if (!EXPORT_TYPES.has(type)) {
    return NextResponse.json({ error: "Tipe ekspor tidak dikenal." }, { status: 400 });
  }

  const loaded = await tryLoadWorkspace(workspaceId, async (tx, context) => {
    if (context.role === "viewer") {
      return { forbidden: true as const };
    }
    const range = resolvePeriod(
      url.searchParams.get("period") ?? undefined,
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
      context.workspace.timezone,
    );
    const cutoff = todayInTimezone(context.workspace.timezone);
    const granularity = url.searchParams.get("growth") === "day" ? "day" : "month";
    if (type === "sales") {
      const report = await getSalesReport(tx, workspaceId, range, granularity);
      return { forbidden: false as const, dateStamp: `${range.from}_${range.to}`, rows: report.rows.slice(0, MAX_EXPORT_ROWS), kind: type };
    }
    if (type === "cash-flow") {
      const report = await getCashFlow(tx, workspaceId, range, url.searchParams.get("account"), granularity);
      return { forbidden: false as const, dateStamp: `${range.from}_${range.to}`, rows: report.rows.slice(0, MAX_EXPORT_ROWS), kind: type };
    }
    const report = await getReceipts(tx, workspaceId, range);
    return { forbidden: false as const, dateStamp: cutoff, rows: report.rows.slice(0, MAX_EXPORT_ROWS), kind: type };
  });

  if (!loaded) {
    return NextResponse.json({ error: "Anda tidak memiliki akses ke workspace ini." }, { status: 403 });
  }
  if (loaded.data.forbidden) {
    return NextResponse.json({ error: "Peran viewer tidak dapat mengekspor data." }, { status: 403 });
  }

  const { rows, dateStamp, kind } = loaded.data;
  const csv =
    kind === "sales"
      ? toCsv(rows as { bucket: string; invoices: string; sales: string; receipts: string }[], [
          { header: "Periode", value: (row) => row.bucket },
          { header: "Jumlah Tagihan", value: (row) => row.invoices, raw: true },
          { header: "Penjualan", value: (row) => row.sales, raw: true },
          { header: "Penerimaan", value: (row) => row.receipts, raw: true },
        ])
      : kind === "cash-flow"
        ? toCsv(rows as { bucket: string; opening: string; inflow: string; outflow: string; closing: string }[], [
            { header: "Periode", value: (row) => row.bucket },
            { header: "Saldo Awal", value: (row) => row.opening, raw: true },
            { header: "Masuk", value: (row) => row.inflow, raw: true },
            { header: "Keluar", value: (row) => row.outflow, raw: true },
            { header: "Saldo Akhir", value: (row) => row.closing, raw: true },
          ])
        : toCsv(
            rows as {
              number: string;
              business_date: string;
              customer_name: string | null;
              method_name: string;
              account_name: string;
              amount: string;
              reversed: boolean;
            }[],
            [
              { header: "Nomor", value: (row) => row.number },
              { header: "Tanggal", value: (row) => row.business_date },
              { header: "Pelanggan", value: (row) => row.customer_name ?? "" },
              { header: "Metode", value: (row) => row.method_name },
              { header: "Akun", value: (row) => row.account_name },
              { header: "Nominal", value: (row) => row.amount, raw: true },
              { header: "Dibatalkan", value: (row) => (row.reversed ? "ya" : "tidak") },
            ],
          );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFileName(`laporan-${kind}`, dateStamp)}"`,
      "cache-control": "no-store",
    },
  });
}
