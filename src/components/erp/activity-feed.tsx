"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Boxes, Network, Warehouse, Factory, ShoppingCart, Receipt, ShieldCheck,
  ClipboardCheck, Cpu, Settings, Database, History, Loader2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/erp/client";
import { cn } from "@/lib/utils";
import type { ActivityLogRow } from "@/lib/erp/activity";

// ─────────────────────────────────────────────────────────────────────────────
// Module metadata — icon + tone classes for the timeline dot/icon.
// Tones restricted to emerald / amber / rose / sky / violet / neutral (no indigo/blue).
// ─────────────────────────────────────────────────────────────────────────────

type ModuleMeta = {
  icon: typeof Boxes;
  label: string;
  tone: "emerald" | "amber" | "rose" | "sky" | "violet" | "neutral";
};

const MODULE_META: Record<string, ModuleMeta> = {
  items:      { icon: Boxes,         label: "Items",      tone: "amber" },
  bom:        { icon: Network,        label: "BOM",        tone: "violet" },
  inventory:  { icon: Warehouse,      label: "Inventory",  tone: "sky" },
  production: { icon: Factory,        label: "Production", tone: "emerald" },
  purchase:   { icon: ShoppingCart,   label: "Purchase",   tone: "amber" },
  sales:      { icon: Receipt,        label: "Sales",      tone: "emerald" },
  quality:    { icon: ShieldCheck,    label: "Quality",    tone: "rose" },
  pdi:        { icon: ClipboardCheck, label: "PDI",        tone: "violet" },
  shopfloor:  { icon: Cpu,            label: "Shop floor", tone: "sky" },
  settings:   { icon: Settings,       label: "Settings",   tone: "neutral" },
  seed:       { icon: Database,       label: "Seed",        tone: "neutral" },
};

const TONE_ICON: Record<ModuleMeta["tone"], string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber:   "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  rose:    "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  sky:     "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  violet:  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  neutral: "bg-muted text-muted-foreground",
};

const TONE_DOT: Record<ModuleMeta["tone"], string> = {
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  rose:    "bg-rose-500",
  sky:     "bg-sky-500",
  violet:  "bg-violet-500",
  neutral: "bg-muted-foreground/60",
};

// Filter chips shown above the timeline. "all" = no module filter.
type Filter = { value: string; label: string };
const FILTERS: Filter[] = [
  { value: "all", label: "All" },
  { value: "items", label: "Items" },
  { value: "production", label: "Production" },
  { value: "purchase", label: "Purchase" },
  { value: "sales", label: "Sales" },
  { value: "quality", label: "Quality" },
  { value: "shopfloor", label: "Shop floor" },
];

// ─────────────────────────────────────────────────────────────────────────────
// External trigger — same pattern as `openCommandPalette()`. Dispatches a
// module-level event the ActivityFeed component listens for.
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_EVENT = "tau:activity-drawer:open";
export function openActivityDrawer(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}

// ─────────────────────────────────────────────────────────────────────────────
// Relative-time helper ("2h ago"). Pure, deterministic given `ts` + `now`.
// ─────────────────────────────────────────────────────────────────────────────

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
  // Beyond a week: show the date compactly (e.g. "Oct 7").
  return new Date(then).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityFeed — renders the Sheet + timeline. Mounted once in layout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export function ActivityFeed() {
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<string>("all");
  const [now, setNow] = useState<number>(() => Date.now());

  // Listen for the external open trigger (header button + command palette).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Refresh the relative-time baseline ~every 60s while the drawer is open.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [open]);

  const key = module === "all"
    ? "/api/activity?limit=50"
    : `/api/activity?limit=50&module=${module}`;
  const { data, isLoading, isError } = useApi<ActivityLogRow[]>(key);

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" />
            Activity log
          </SheetTitle>
          <SheetDescription>
            Recent business events across all ERP modules — newest first.
          </SheetDescription>
        </SheetHeader>

        {/* Filter chips */}
        <div className="px-4 py-2 border-b bg-muted/20">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = module === f.value;
              return (
                <Button
                  key={f.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-[11px] font-medium"
                  onClick={() => setModule(f.value)}
                  aria-pressed={active}
                >
                  {f.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Timeline body */}
        <div className="flex-1 overflow-y-auto scroll-thin px-4 py-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              <History className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
              Could not load activity. Try again.
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              <History className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
              No activity yet for this filter.
            </div>
          ) : (
            <ol className="relative ml-2 border-l border-border space-y-4">
              {rows.map((row) => {
                const meta = MODULE_META[row.module] ?? MODULE_META.settings;
                const Icon = meta.icon;
                const rel = relativeTime(row.ts, now);
                return (
                  <li key={row.id} className="relative pl-5">
                    {/* Dot sitting on the left border */}
                    <span
                      className={cn(
                        "absolute left-0 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-background",
                        TONE_DOT[meta.tone],
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex items-start gap-2.5">
                      {/* Icon chip */}
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0",
                          TONE_ICON[meta.tone],
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm leading-snug text-foreground">{row.title}</p>
                          {rel && (
                            <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap tabular-nums shrink-0 pt-0.5">
                              {rel}
                            </span>
                          )}
                        </div>
                        {row.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {row.detail}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 font-medium uppercase tracking-wider"
                          >
                            {meta.label}
                          </Badge>
                          {row.refId && (
                            <span className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
                              {row.refId}
                            </span>
                          )}
                          {row.user && row.user !== "system" && (
                            <span className="text-[10px] text-muted-foreground/70">
                              · by {row.user}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <History className="h-3 w-3 opacity-50" />
            )}
            <span className="tabular-nums">{rows.length} {rows.length === 1 ? "event" : "events"}</span>
          </span>
          <span>Append-only · live with HMR</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Header chip — opens the activity drawer on click. */
export function ActivityButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => openActivityDrawer()}
      aria-label="View activity log"
      title="Activity log"
    >
      <History className="h-4 w-4" />
    </Button>
  );
}
