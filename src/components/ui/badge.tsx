import * as React from "react";

import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "info" | "positive" | "warning" | "danger" | "brand";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-border-subtle bg-canvas text-ink-muted",
  brand: "border-brand-200 bg-brand-50 text-brand-800",
  info: "border-sky-200 bg-info-surface text-info",
  positive: "border-emerald-200 bg-success-surface text-success",
  warning: "border-amber-200 bg-warning-surface text-warning",
  danger: "border-rose-200 bg-danger-surface text-danger",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  icon,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
