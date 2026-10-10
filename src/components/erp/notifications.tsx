"use client";
import { useMemo } from "react";
import { Bell, FileClock, ShieldAlert, Boxes, FileCheck2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/erp/client";
import { useNav, type View } from "@/lib/erp/nav";
import type { Summary, Phase3Summary } from "@/lib/erp/shared";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  label: string;
  count: number;
  view: View;
  icon: typeof Bell;
  tone: "warn" | "danger" | "info";
};

const TONE_CLASSES: Record<Alert["tone"], string> = {
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
  info: "text-muted-foreground",
};

/** Header bell icon that surfaces actionable open-item alerts in a popover. */
export function NotificationsBell() {
  const { go } = useNav();
  const { data: summary, isLoading: l1 } = useApi<Summary>("/api/summary");
  const { data: phase3, isLoading: l2 } = useApi<Phase3Summary>("/api/phase3/summary");

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    if (summary) {
      if (summary.irnPending > 0)
        out.push({ id: "irn", label: "Invoices awaiting IRN", count: summary.irnPending, view: "sales", icon: FileClock, tone: "warn" });
      if (summary.openIndents > 0)
        out.push({ id: "indents", label: "Open purchase indents", count: summary.openIndents, view: "purchase", icon: ClipboardList, tone: "info" });
    }
    if (phase3) {
      if (phase3.openNcrs > 0)
        out.push({ id: "ncr", label: "Open NCRs", count: phase3.openNcrs, view: "quality", icon: ShieldAlert, tone: "danger" });
      if (phase3.unbinned > 0)
        out.push({ id: "bin", label: "Stock to put away", count: phase3.unbinned, view: "warehouse", icon: Boxes, tone: "warn" });
      if (phase3.ppapPending > 0)
        out.push({ id: "ppap", label: "PPAP submissions pending", count: phase3.ppapPending, view: "quality", icon: FileCheck2, tone: "info" });
    }
    return out;
  }, [summary, phase3]);

  const total = alerts.reduce((s, a) => s + a.count, 0);
  const loading = l1 || l2;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Notifications${total > 0 ? ` (${total} open)` : ""}`}
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none justify-center"
            >
              {total > 99 ? "99+" : total}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Open alerts</span>
          {total > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">{total} total</span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto scroll-thin">
          {loading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              <FileCheck2 className="h-5 w-5 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
              All clear — no open alerts.
            </div>
          ) : (
            <ul className="py-1">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => go(a.view)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    <a.icon className={cn("h-4 w-4 shrink-0", TONE_CLASSES[a.tone])} />
                    <span className="flex-1 leading-tight">
                      {a.label}
                      <span className="block text-[11px] text-muted-foreground capitalize">
                        Go to {a.view}
                      </span>
                    </span>
                    <span className="tabular-nums text-sm font-semibold">{a.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
