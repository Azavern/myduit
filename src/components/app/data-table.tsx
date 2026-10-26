"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState, Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ColumnKind = "text" | "money" | "numeric" | "date" | "badge" | "quantity";

export type ColumnSpec = {
  key: string;
  header: string;
  kind?: ColumnKind;
  align?: "left" | "right";
  muted?: boolean;
  sortable?: boolean;
  /** Maps a cell value to a badge label/tone for kind="badge". */
  badges?: Record<string, { label: string; tone: "neutral" | "info" | "positive" | "warning" | "danger" | "brand" }>;
};

export type RowData = Record<string, string | number | boolean | null>;

const TONE_CLASSES: Record<string, string> = {
  neutral: "border-border-subtle bg-canvas text-ink-muted",
  brand: "border-brand-200 bg-brand-50 text-brand-800",
  info: "border-sky-200 bg-info-surface text-info",
  positive: "border-emerald-200 bg-success-surface text-success",
  warning: "border-amber-200 bg-warning-surface text-warning",
  danger: "border-rose-200 bg-danger-surface text-danger",
};

const moneyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function formatMoney(value: string | number | boolean): string {
  const digits = String(value).split(".")[0] ?? "0";
  try {
    return moneyFormatter.format(BigInt(digits || "0"));
  } catch {
    return String(value);
  }
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${Number(day)} ${months[Number(month) - 1] ?? month} ${year}`;
}

function renderCell(spec: ColumnSpec, value: RowData[string]) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-subtle">—</span>;
  }
  switch (spec.kind) {
    case "money":
      return <span className="tabular">{formatMoney(value)}</span>;
    case "numeric":
    case "quantity":
      return <span className="tabular">{String(value)}</span>;
    case "date":
      return <span className="whitespace-nowrap">{formatDate(String(value))}</span>;
    case "badge": {
      const badge = spec.badges?.[String(value)];
      const tone = badge?.tone ?? "neutral";
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            TONE_CLASSES[tone] ?? TONE_CLASSES.neutral,
          )}
        >
          {badge?.label ?? String(value)}
        </span>
      );
    }
    default:
      return <span>{String(value)}</span>;
  }
}

export function DataTable({
  columns,
  rows,
  rowHref,
  emptyTitle,
  emptyDescription,
  summary,
}: {
  columns: ColumnSpec[];
  rows: RowData[];
  rowHref?: { prefix: string; key: string };
  emptyTitle: string;
  emptyDescription: string;
  summary?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const tableColumns = useMemo<ColumnDef<RowData>[]>(
    () =>
      columns.map((spec) => ({
        id: spec.key,
        accessorFn: (row) => row[spec.key],
        header: spec.header,
        enableSorting: spec.sortable ?? true,
        sortingFn: spec.kind === "money" || spec.kind === "numeric" || spec.kind === "quantity" ? "basic" : "alphanumeric",
        meta: spec,
      })),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      <TableWrap>
        <Table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const spec = header.column.columnDef.meta as ColumnSpec | undefined;
                  const sorted = header.column.getIsSorted();
                  return (
                    <Th key={header.id} className={spec?.align === "right" ? "text-right" : undefined}>
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-brand-700"
                          aria-label={`Urutkan berdasarkan ${spec?.header ?? header.id}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true" className="text-[10px]">
                            {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </Th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <Tr key={row.id}>
                {row.getVisibleCells().map((cell, index) => {
                  const spec = cell.column.columnDef.meta as ColumnSpec | undefined;
                  const isFirst = index === 0;
                  return (
                    <Td
                      key={cell.id}
                      className={cn(spec?.align === "right" && "text-right", spec?.muted && "text-ink-muted")}
                    >
                      {isFirst && rowHref ? (
                        <Link
                          href={`${rowHref.prefix}${String(row.original[rowHref.key] ?? "")}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {renderCell(spec ?? { key: cell.column.id, header: cell.column.id }, cell.getValue() as RowData[string])}
                        </Link>
                      ) : (
                        renderCell(spec ?? { key: cell.column.id, header: cell.column.id }, cell.getValue() as RowData[string])
                      )}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {summary ? <div className="border-t border-border-subtle px-3 py-3 text-sm text-ink-muted">{summary}</div> : null}
    </div>
  );
}
