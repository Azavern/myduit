"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; group: string };

export function WorkspaceNav({ workspaceId, groups, items }: { workspaceId: string; groups: string[]; items: NavItem[] }) {
  const pathname = usePathname();
  const current = pathname.split("/")[3] ?? "dashboard";

  return (
    <nav
      aria-label="Navigasi utama"
      className="flex gap-1 overflow-x-auto pb-1 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {groups.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="flex gap-1 lg:mt-4 lg:flex-col">
            <p className="hidden px-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle lg:block">{group}</p>
            {groupItems.map((item) => {
              const active = current === item.href;
              return (
                <Link
                  key={item.href}
                  href={`/w/${workspaceId}/${item.href}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-brand-50 text-brand-800" : "text-ink-muted hover:bg-brand-50/60 hover:text-brand-800",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
