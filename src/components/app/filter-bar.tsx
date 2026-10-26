import Link from "next/link";

import { Input, Select } from "@/components/ui/field";

export type FilterField =
  | { type: "search"; name: string; label: string; placeholder?: string }
  | { type: "date"; name: string; label: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[] };

export function FilterBar({
  action,
  fields,
  values,
  resetHref,
}: {
  action: string;
  fields: FilterField[];
  values: Record<string, string | undefined>;
  resetHref: string;
}) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3">
      {fields.map((field) => (
        <div key={field.name} className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label htmlFor={`filter-${field.name}`} className="text-xs font-medium text-ink-muted">
            {field.label}
          </label>
          {field.type === "select" ? (
            <Select id={`filter-${field.name}`} name={field.name} defaultValue={values[field.name] ?? ""}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={`filter-${field.name}`}
              name={field.name}
              type={field.type === "date" ? "date" : "search"}
              defaultValue={values[field.name] ?? ""}
              placeholder={field.type === "search" ? field.placeholder : undefined}
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          Terapkan
        </button>
        <Link
          href={resetHref}
          className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}

export function Pagination({
  basePath,
  query,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const link = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-ink-muted">
      <p>
        Menampilkan {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} dari {total} data
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={link(page - 1)} className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 hover:bg-brand-50">
            Sebelumnya
          </Link>
        ) : (
          <span className="rounded-lg border border-border-subtle px-3 py-1.5 opacity-50">Sebelumnya</span>
        )}
        <span className="tabular">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={link(page + 1)} className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 hover:bg-brand-50">
            Berikutnya
          </Link>
        ) : (
          <span className="rounded-lg border border-border-subtle px-3 py-1.5 opacity-50">Berikutnya</span>
        )}
      </div>
    </div>
  );
}
