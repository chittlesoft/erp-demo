"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Boxes, Network, Warehouse, Factory, ShoppingCart, Receipt, ShieldCheck,
  ClipboardCheck, Cpu, Settings, Database, History, Loader2, Download,
  CalendarDays, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/erp/client";
import { cn } from "@/lib/utils";
import { isAdmin } from "@/lib/erp/auth-shared";
import { downloadCSV, type CsvColumn } from "@/lib/erp/csv";
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

// CSV column layout for the activity-log export — matches ActivityLogRow field
// order. Defined once at module scope so the column array identity is stable.
const ACTIVITY_CSV_COLUMNS: CsvColumn[] = [
  { key: "id",       header: "ID" },
  { key: "ts",       header: "Timestamp" },
  { key: "module",   header: "Module" },
  { key: "action",   header: "Action" },
  { key: "refType",  header: "Ref Type" },
  { key: "refId",    header: "Ref ID" },
  { key: "refIdInt", header: "Ref ID (int)" },
  { key: "title",    header: "Title" },
  { key: "detail",   header: "Detail" },
  { key: "user",     header: "User" },
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
// Quick-range presets — set the from/to dates in one click. The currently-active
// preset is derived from the live from/to state so manual date edits can clear
// the active chip (no preset matches → none highlighted) without any extra state.
// `today()` mirrors the `@/lib/erp/shared` `today` helper but inlined here so
// the chip module stays dependency-light (the shared `today` already re-derives
// on every render — calling it from a click handler is fine).
// ─────────────────────────────────────────────────────────────────────────────

type QuickRange = "today" | "7d" | "30d" | "all";

const QUICK_RANGES: { value: QuickRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the QuickRange preset that matches the current `from`/`to` state, or
 * `null` if no preset matches (e.g. the user manually picked a custom range).
 * Empty `from`/`to` is treated as "All time" since clearing the filter == no
 * date restriction. Pure + deterministic so it can be called inline per render.
 */
function activeQuickRange(from: string, to: string): QuickRange | null {
  if (from === "" && to === "") return "all";
  const t = isoToday();
  if (from === t && to === t) return "today";
  if (from === isoDaysAgo(7) && to === t) return "7d";
  if (from === isoDaysAgo(30) && to === t) return "30d";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the activity API URL from the current filter state.
// `exportLimit` lets the CSV export fetch a larger set than the drawer view.
// ─────────────────────────────────────────────────────────────────────────────

function buildUrl(
  module: string,
  from: string,
  to: string,
  limit: number,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (module && module !== "all") params.set("module", module);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/api/activity?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityFeed — renders the Sheet + timeline. Mounted once in layout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export function ActivityFeed() {
  const { data: session } = useSession();
  const admin = isAdmin(session?.user?.role);
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [exporting, setExporting] = useState(false);
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

  const key = buildUrl(module, from, to, 50);
  const { data, isLoading, isError } = useApi<ActivityLogRow[]>(key);

  const rows = useMemo(() => data ?? [], [data]);

  const hasDateFilter = from !== "" || to !== "";

  // Derived from the live from/to state — no separate state variable needed,
  // so manual date edits and chip clicks both stay in sync with the highlight.
  const activeRange = activeQuickRange(from, to);

  function applyQuickRange(r: QuickRange) {
    const t = isoToday();
    if (r === "today") {
      setFrom(t);
      setTo(t);
    } else if (r === "7d") {
      setFrom(isoDaysAgo(7));
      setTo(t);
    } else if (r === "30d") {
      setFrom(isoDaysAgo(30));
      setTo(t);
    } else {
      // "all" → clear the date filter (matches the existing Clear button).
      setFrom("");
      setTo("");
    }
  }

  function clearDates() {
    setFrom("");
    setTo("");
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      // Fetch a larger set (up to the API's max of 200) so the export captures
      // more than just the visible drawer rows. Same filter params as the view.
      const url = buildUrl(module, from, to, 200);
      const res = await fetch(url);
      if (!res.ok) {
        let msg = `Export failed (HTTP ${res.status})`;
        try { msg = JSON.parse(await res.text()).message ?? msg; } catch { /* keep default */ }
        throw new Error(msg);
      }
      const exportRows = (await res.json()) as ActivityLogRow[];
      // Filename includes the module + date range so multiple exports are
      // distinguishable in the downloads folder.
      const parts = ["activity-log"];
      if (module !== "all") parts.push(module);
      if (from) parts.push(`from-${from}`);
      if (to) parts.push(`to-${to}`);
      downloadCSV(parts.join("-"), exportRows, ACTIVITY_CSV_COLUMNS);
    } catch (e) {
      // Defensive — never throw from the click handler. The toast hook isn't
      // wired here to keep the export button self-contained; the empty catch
      // plus the exporting state already convey failure to the user.
      console.error("[activity] CSV export failed:", e instanceof Error ? e.message : e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" />
            Activity log
            {admin && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={exportCsv}
                disabled={exporting || rows.length === 0}
                className="ml-auto h-7 gap-1.5 text-[11px]"
                title="Export the currently-filtered activity log to CSV (admin only)"
              >
                {exporting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />}
                {exporting ? "Exporting…" : "Export CSV"}
              </Button>
            )}
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

        {/* Date-range filter */}
        <div className="px-4 py-2 border-b bg-muted/10">
          {/* Quick-range presets — one click sets from/to to a sensible window.
              `activeRange` is derived live, so it stays in sync with manual
              date edits (and vice versa: a chip click updates the inputs). */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {QUICK_RANGES.map((r) => {
              const active = activeRange === r.value;
              return (
                <Button
                  key={r.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-[11px] font-medium"
                  onClick={() => applyQuickRange(r.value)}
                  aria-pressed={active}
                  title={
                    r.value === "all"
                      ? "Clear the date filter (show all activity)"
                      : `Filter to ${r.label.toLowerCase()}`
                  }
                >
                  {r.label}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">Date range</span>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Filter from date"
              className="h-7 w-auto text-xs px-1.5"
            />
            <span className="text-[11px] text-muted-foreground/70 shrink-0">to</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Filter to date"
              className="h-7 w-auto text-xs px-1.5"
            />
            {hasDateFilter && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearDates}
                className="h-7 px-2 text-[11px] gap-1 ml-auto"
                title="Clear date filter"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
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
            {hasDateFilter && (
              <span className="text-muted-foreground/60">
                · {from || "—"} → {to || "—"}
              </span>
            )}
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
