"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  FileClock,
  ShieldAlert,
  Boxes,
  FileCheck2,
  ClipboardList,
  Mail,
  Settings2,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, apiRequest } from "@/lib/erp/client";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_PREFS,
  type NotificationPrefs,
} from "@/lib/notification-prefs";

/** Row config: pref key ↔ icon + label + description. */
const PREF_ROWS: {
  key: keyof NotificationPrefs;
  icon: typeof Bell;
  label: string;
  desc: string;
}[] = [
  {
    key: "irnPending",
    icon: FileClock,
    label: "Invoices awaiting IRN",
    desc: "e-Invoice JSON not yet uploaded to the IRP.",
  },
  {
    key: "openNcrs",
    icon: ShieldAlert,
    label: "Open NCRs",
    desc: "Non-conformance reports still open.",
  },
  {
    key: "putAway",
    icon: Boxes,
    label: "Stock to put away",
    desc: "Stock received but not yet binned.",
  },
  {
    key: "ppapPending",
    icon: FileCheck2,
    label: "PPAP pending",
    desc: "Production part approvals still pending.",
  },
  {
    key: "openIndents",
    icon: ClipboardList,
    label: "Open indents",
    desc: "Purchase indents awaiting conversion to POs.",
  },
  {
    key: "dailyDigest",
    icon: Mail,
    label: "Daily digest email",
    desc: "Receive a single end-of-day summary (UI toggle only — no email is sent in this prototype).",
  },
];

const PREFS_QUERY_KEY = ["/api/notifications/preferences"];

/** Trigger button + dialog for per-user notification preferences. */
export function NotificationPreferences({
  trigger,
}: {
  /** Optional custom trigger; defaults to a small ghost icon button. */
  trigger?: ReactNode;
}) {
  const { data: serverPrefs, isLoading } = useApi<NotificationPrefs>(
    "/api/notifications/preferences",
  );
  // Optimistic local state — mirrors the server prefs while a PATCH is in
  // flight so the Switch reflects the user's click instantly. Reset to the
  // server value whenever the server catches up (success or refetch).
  const [optimistic, setOptimistic] = useState<NotificationPrefs | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const prefs: NotificationPrefs = optimistic ?? serverPrefs ?? DEFAULT_PREFS;

  const patch = useMutation({
    mutationFn: async (next: NotificationPrefs) => {
      const res = await apiRequest(
        "PATCH",
        "/api/notifications/preferences",
        next,
      );
      return (await res.json()) as NotificationPrefs;
    },
    // Optimistically populate the cache so the bell popover re-renders with
    // the new value before the server responds.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: PREFS_QUERY_KEY });
      const prev = qc.getQueryData<NotificationPrefs>(PREFS_QUERY_KEY);
      qc.setQueryData<NotificationPrefs>(PREFS_QUERY_KEY, next);
      return { prev };
    },
    onError: (e: Error, _next, ctx) => {
      // Roll the cache back + drop the optimistic overlay so the Switch
      // snaps to the last-known-good server value.
      if (ctx?.prev) qc.setQueryData(PREFS_QUERY_KEY, ctx.prev);
      setOptimistic(null);
      toast({
        title: "Couldn't save preferences",
        description: e.message,
        variant: "destructive",
      });
    },
    onSuccess: (saved) => {
      setOptimistic(null);
      qc.setQueryData<NotificationPrefs>(PREFS_QUERY_KEY, saved);
      qc.invalidateQueries({ queryKey: PREFS_QUERY_KEY });
      toast({ title: "Notification preferences saved" });
    },
  });

  const setPref = (key: keyof NotificationPrefs, value: boolean) => {
    const next: NotificationPrefs = { ...prefs, [key]: value };
    setOptimistic(next);
    patch.mutate(next);
  };

  const reset = () => {
    const next: NotificationPrefs = { ...DEFAULT_PREFS };
    setOptimistic(next);
    patch.mutate(next);
  };

  const enabledCount = useMemo(
    () =>
      PREF_ROWS.filter((r) => r.key !== "dailyDigest").filter(
        (r) => prefs[r.key],
      ).length,
    [prefs],
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Notification preferences"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Preferences
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notification preferences</DialogTitle>
          <DialogDescription>
            Choose which open-item alerts surface in the bell menu. The badge
            count updates to reflect only the alerts you keep enabled.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {PREF_ROWS.map((row) => {
              const Icon = row.icon;
              const checked = prefs[row.key];
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">
                      {row.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {row.desc}
                    </div>
                  </div>
                  <Switch
                    checked={checked}
                    onCheckedChange={(v) => setPref(row.key, v)}
                    disabled={patch.isPending}
                    aria-label={`Toggle ${row.label}`}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {enabledCount} of {PREF_ROWS.length - 1} actionable alerts enabled
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={reset}
            disabled={patch.isPending}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </Button>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="sm">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
