"use client";
import type { ReactNode } from "react";
import { Inbox, TrendingDown, TrendingUp } from "lucide-react";

/** Tone keys for KPI accents (no indigo/blue). */
export type KpiTone = "emerald" | "amber" | "rose" | "sky" | "violet" | "neutral";

const TONE_CLASS: Record<KpiTone, string> = {
  emerald: "kpi-accent-emerald",
  amber: "kpi-accent-amber",
  rose: "kpi-accent-rose",
  sky: "kpi-accent-sky",
  violet: "kpi-accent-violet",
  neutral: "kpi-accent-neutral",
};

/** Status pill with a colour per known status. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PLANNED: "bg-secondary text-secondary-foreground",
    OPEN: "bg-secondary text-secondary-foreground",
    PARTIAL: "bg-accent text-accent-foreground",
    CLOSED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    IRN_PENDING: "bg-accent text-accent-foreground",
    IRN_OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    IN_PROGRESS: "bg-accent text-accent-foreground",
    COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    ACCEPT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    REJECT: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    PASS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    FAIL: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    QUEUED: "bg-secondary text-secondary-foreground",
    HOLD: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    SCRAP: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    REWORK: "bg-accent text-accent-foreground",
    ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    INTERIM: "bg-accent text-accent-foreground",
    SUBMITTED: "bg-accent text-accent-foreground",
    PENDING: "bg-secondary text-secondary-foreground",
    ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    CNL: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    OVERDUE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    EWB_OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    EWB_PENDING: "bg-accent text-accent-foreground",
    NOT_REQUIRED: "bg-secondary text-secondary-foreground",
    ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    CRN: "bg-secondary text-secondary-foreground",
    DBN: "bg-accent text-accent-foreground",
    RETURN: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    RETURNED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };
  const labels: Record<string, string> = {
    IRN_PENDING: "IRN pending", IRN_OK: "IRN generated", CNL: "IRN cancelled",
    EWB_OK: "EWB generated", EWB_PENDING: "EWB required", NOT_REQUIRED: "EWB not required",
    CRN: "Credit note", DBN: "Debit note", IN_PROGRESS: "In progress", PLANNED: "Planned",
    COMPLETED: "Completed", PARTIAL: "Partial", CLOSED: "Closed", OPEN: "Open",
    QUEUED: "Queued", HOLD: "On hold", DONE: "Done", SCRAP: "Scrap", REWORK: "Rework",
    ACCEPT: "Accept", REJECT: "Reject", PASS: "Pass", FAIL: "Fail",
    ACCEPTED: "Accepted", APPROVED: "Approved", REJECTED: "Rejected", INTERIM: "Interim",
    SUBMITTED: "Submitted", PENDING: "Pending", ERROR: "Error", CANCELLED: "Cancelled",
    OVERDUE: "Overdue", ACTIVE: "Active", RETURN: "Return", RETURNED: "Returned",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider leading-none ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

/** Page heading with intro text + optional action buttons. */
export function PageIntro({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 pb-3 border-b border-border/60">
      <p className="text-sm text-muted-foreground max-w-2xl">{children}</p>
      {actions && <div className="sm:ml-auto flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-5 w-5 mx-auto mb-2 opacity-40" aria-hidden />
      {children}
    </div>
  );
}

/**
 * KPI tile. `accent` recolours the value text (legacy Tailwind class string, kept for back-compat).
 * `tone` adds a subtle left border + faint tinted background for sentiment grouping.
 * Values that are "dead" (—, 0, ₹0, empty) render muted/smaller to reduce visual dead space.
 */
export function Kpi({
  label,
  value,
  sub,
  testid,
  accent,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  testid?: string;
  accent?: string;
  tone?: KpiTone;
}) {
  const v = value?.trim() ?? "";
  const isDead = v === "" || v === "—" || v === "0" || v === "₹0" || v === "₹0.00";
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-xs card-hover ${tone ? TONE_CLASS[tone] : ""}`}>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div
        data-testid={testid}
        className={`tabular-nums ${accent ?? ""} ${isDead
          ? "mt-1.5 text-base font-medium text-muted-foreground/60"
          : "mt-1 text-xl font-semibold"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/** Small delta indicator with up/down arrow + coloured text. `invert` flips polarity (e.g. reject rate). */
export function StatTrend({ delta, suffix = "%", invert = false }: { delta: number; suffix?: string; invert?: boolean }) {
  const up = delta >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {up ? "+" : ""}{delta}{suffix}
    </span>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-sm font-semibold">{children}</h2>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/**
 * Titled card with header (title + optional subtitle + optional right slot) and body.
 * Drop-in replacement for the ad-hoc `rounded-xl border bg-card shadow-xs` + header div pattern.
 */
export function SectionCard({
  title,
  subtitle,
  right,
  children,
  className,
  bodyClassName,
  headerClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}) {
  return (
    <section className={`rounded-xl border bg-card shadow-xs ${className ?? ""}`}>
      {(title || subtitle || right) && (
        <div className={`px-5 pt-4 pb-2 flex items-center gap-3 ${headerClassName ?? ""}`}>
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold leading-tight truncate">{title}</h2>}
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          {right && <div className="ml-auto shrink-0">{right}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
