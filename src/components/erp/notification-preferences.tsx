"use client";
import { useMemo, type ReactNode } from "react";
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
import {
  useNotificationPrefs,
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

/** Trigger button + dialog for per-user notification preferences. */
export function NotificationPreferences({
  trigger,
}: {
  /** Optional custom trigger; defaults to a small ghost icon button. */
  trigger?: ReactNode;
}) {
  const { prefs, setPref, reset } = useNotificationPrefs();

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
                  aria-label={`Toggle ${row.label}`}
                />
              </li>
            );
          })}
        </ul>

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
