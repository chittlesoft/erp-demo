"use client";
// Compact dashboard "Recent activity" widget — a trimmed-down sibling of the
// full drawer timeline in `./activity-feed`. Renders the 5 newest entries from
// /api/activity with the same module→icon mapping + tone classes (no indigo/
// blue). The "View all" link in the header opens the full drawer via the same
// `openActivityDrawer()` event the activity-feed listens for.

import { useEffect, useMemo, useState } from "react";
import {
  Boxes, Network, Warehouse, Factory, ShoppingCart, Receipt, ShieldCheck,
  ClipboardCheck, Cpu, Settings, Database, History,
} from "lucide-react";
import { useApi } from "@/lib/erp/client";
import { SectionCard, Empty } from "./shared";
import { openActivityDrawer } from "./activity-feed";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ActivityLogRow } from "@/lib/erp/activity";

// Module → icon + tone (kept in sync with activity-feed.tsx).
type ModuleMeta = { icon: typeof Boxes; tone: Tone };
type Tone = "emerald" | "amber" | "rose" | "sky" | "violet" | "neutral";

const MODULE_META: Record<string, ModuleMeta> = {
  items:      { icon: Boxes,          tone: "amber" },
  bom:        { icon: Network,         tone: "violet" },
  inventory:  { icon: Warehouse,       tone: "sky" },
  production: { icon: Factory,         tone: "emerald" },
  purchase:   { icon: ShoppingCart,    tone: "amber" },
  sales:      { icon: Receipt,         tone: "emerald" },
  quality:    { icon: ShieldCheck,     tone: "rose" },
  pdi:        { icon: ClipboardCheck,  tone: "violet" },
  shopfloor:  { icon: Cpu,             tone: "sky" },
  settings:   { icon: Settings,        tone: "neutral" },
  seed:       { icon: Database,        tone: "neutral" },
};

const TONE_ICON: Record<Tone, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber:   "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  rose:    "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  sky:     "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  violet:  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  neutral: "bg-muted text-muted-foreground",
};

// Relative-time helper — mirrors activity-feed.tsx for consistent "2h ago" copy.
function relativeTime(ts: string, now: number): string {
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function ActivityWidget({ className }: { className?: string }) {
  const { data, isLoading, isError } = useApi<ActivityLogRow[]>("/api/activity?limit=5");
  const [now, setNow] = useState<number>(() => Date.now());
  // Refresh the relative-time baseline every 60s while mounted.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const rows = useMemo(() => data ?? [], [data]);

  return (
    <SectionCard
      className={className}
      title={
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          Recent activity
        </span>
      }
      right={
        <button
          type="button"
          onClick={() => openActivityDrawer()}
          className="text-xs text-primary hover:underline"
        >
          View all
        </button>
      }
      bodyClassName="max-h-80 overflow-y-auto scroll-thin"
    >
      {isLoading ? (
        <div className="px-5 py-3 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <Empty>Could not load activity</Empty>
      ) : rows.length === 0 ? (
        <Empty>No activity yet</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const meta = MODULE_META[row.module] ?? MODULE_META.settings;
            const Icon = meta.icon;
            const rel = relativeTime(row.ts, now);
            return (
              <li
                key={row.id}
                className="flex items-start gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0",
                    TONE_ICON[meta.tone],
                  )}
                  aria-hidden
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="leading-snug text-foreground truncate">{row.title}</p>
                    {rel && (
                      <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap tabular-nums shrink-0 pt-0.5">
                        {rel}
                      </span>
                    )}
                  </div>
                  {row.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.detail}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
