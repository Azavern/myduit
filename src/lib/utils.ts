import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Sort fields coming from the URL must be whitelisted. Never interpolate a
 * client-provided identifier into SQL (blueprint §10).
 */
export function pickSortField<T extends string>(
  requested: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (requested && (allowed as readonly string[]).includes(requested)) {
    return requested as T;
  }
  return fallback;
}

export function clampInt(
  value: string | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
