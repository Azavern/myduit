"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const money = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function toNumber(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const PALETTE = ["#0d9488", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4", "#0f766e", "#115e59", "#134e4a"];

export function CashFlowChart({ data }: { data: { bucket: string; inflow: string; outflow: string }[] }) {
  if (data.length === 0) {
    return <EmptyChart label="Belum ada pergerakan kas pada periode ini." />;
  }
  const series = data.map((point) => ({
    date: point.bucket.slice(5),
    Masuk: toNumber(point.inflow),
    Keluar: toNumber(point.outflow),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ea" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#7b8a93" />
          <YAxis tickFormatter={(value: number) => money.format(value)} tick={{ fontSize: 11 }} stroke="#7b8a93" width={64} />
          <Tooltip formatter={(value) => `Rp${full.format(Number(value ?? 0))}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="Masuk" stroke="#0d9488" fill="#99f6e4" fillOpacity={0.5} />
          <Area type="monotone" dataKey="Keluar" stroke="#be123c" fill="#fecdd3" fillOpacity={0.4} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SalesVsReceiptsChart({ data }: { data: { bucket: string; sales: string; receipts: string }[] }) {
  if (data.length === 0) return <EmptyChart label="Belum ada penjualan atau penerimaan." />;
  const series = data.map((point) => ({
    bulan: point.bucket.slice(0, 7),
    Penjualan: toNumber(point.sales),
    Penerimaan: toNumber(point.receipts),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ea" vertical={false} />
          <XAxis dataKey="bulan" tick={{ fontSize: 11 }} stroke="#7b8a93" />
          <YAxis tickFormatter={(value: number) => money.format(value)} tick={{ fontSize: 11 }} stroke="#7b8a93" width={64} />
          <Tooltip formatter={(value) => `Rp${full.format(Number(value ?? 0))}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Penjualan" fill="#0d9488" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Penerimaan" fill="#5eead4" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseDonut({ data }: { data: { name: string; amount: string }[] }) {
  if (data.length === 0) return <EmptyChart label="Belum ada pengeluaran pada periode ini." />;
  const series = data.map((item) => ({ name: item.name, value: toNumber(item.amount) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={series} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="78%" paddingAngle={2}>
            {series.map((entry, index) => (
              <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => `Rp${full.format(Number(value ?? 0))}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AgingChart({ data }: { data: { label: string; amount: string }[] }) {
  const series = data.map((item) => ({ bucket: item.label.replace("Terlambat ", ""), Nilai: toNumber(item.amount) }));
  if (series.every((item) => item.Nilai === 0)) return <EmptyChart label="Tidak ada piutang terbuka." />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ea" horizontal={false} />
          <XAxis type="number" tickFormatter={(value: number) => money.format(value)} tick={{ fontSize: 11 }} stroke="#7b8a93" />
          <YAxis type="category" dataKey="bucket" tick={{ fontSize: 11 }} stroke="#7b8a93" width={120} />
          <Tooltip formatter={(value) => `Rp${full.format(Number(value ?? 0))}`} />
          <Bar dataKey="Nilai" fill="#0d9488" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border-subtle text-sm text-ink-muted">
      {label}
    </div>
  );
}
