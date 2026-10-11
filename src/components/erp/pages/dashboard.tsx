"use client";
import { useApi, inr, qty, lookup, LINE_LABEL } from "@/lib/erp/client";
import type { Dashboard, Summary, Phase3Summary, ItemRow, ProductionOrder } from "@/lib/erp/shared";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Kpi, Empty, StatusBadge, SectionCard, StatTrend } from "../shared";
import { useNav } from "@/lib/erp/nav";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useAction } from "@/lib/erp/client";
import { Button } from "@/components/ui/button";
import { ActivityWidget } from "../activity-widget";
import { ProductionTrendChart } from "../production-trend-chart";
import { ReorderSparkline } from "../reorder-sparkline";
import { useSession } from "next-auth/react";
import { asRole, isAdmin } from "@/lib/erp/auth-shared";

/** Mirrors the `?summary=true` response from /api/analytics/trend. */
type TrendSummary = {
  today: { date: string; good: number; reject: number; fpy: number | null };
  yesterday: { date: string; good: number; reject: number; fpy: number | null };
  deltaGood: number;
  deltaReject: number;
  deltaFpy: number | null;
};

/**
 * The base `Summary` type (in `@/lib/erp/shared`, owned by a different agent)
 * only declares the original 7 KPI fields. The `/api/summary` route returns a
 * superset that also includes `salesLastMonth` + `salesMtdDeltaPct` (added in
 * round 14-a). We declare those two extras here as a locally-augmented type so
 * the dashboard can read them without touching `shared.ts` — TypeScript lets
 * `useApi<SummaryWithDelta>` read the wider shape, and the missing fields are
 * simply `undefined` if the route ever returns the bare shape.
 */
type SummaryWithDelta = Summary & {
  salesLastMonth?: number;
  salesMtdDeltaPct?: number | null;
};

/**
 * Wraps a `Kpi` card with an optional `trend` indicator pinned to the
 * top-right corner (same row as the label). Used for today-vs-yesterday deltas
 * on the "Sensors produced (good)" + "First-pass yield" cards. When `trend` is
 * omitted, renders the bare Kpi so the grid layout is unchanged.
 */
function KpiWithTrend({ children, trend }: { children: ReactNode; trend?: ReactNode }) {
  if (!trend) return <>{children}</>;
  return (
    <div className="relative">
      {children}
      <div className="absolute top-3 right-3">{trend}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1 section-divider">
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useApi<Dashboard>("/api/dashboard");
  const { data: orders } = useApi<ProductionOrder[]>("/api/orders");
  const p3 = useApi<Phase3Summary>("/api/phase3/summary").data;
  const sum = useApi<SummaryWithDelta>("/api/summary").data;
  // Today vs yesterday deltas for the "Sensors produced (good)" + "First-pass
  // yield" KPI indicators. `?summary=true` returns the trend array PLUS the
  // delta fields; the dashboard's chart keeps using the bare array endpoint.
  const deltas = useApi<TrendSummary>("/api/analytics/trend?days=14&summary=true").data;
  const items = lookup(useApi<ItemRow[]>("/api/items").data);
  const { go } = useNav();
  const reseed = useAction("POST", "/api/seed", "Demo data reloaded");
  const { data: session } = useSession();
  const admin = isAdmin(asRole(session?.user?.role));

  // Greeting — first word of the signed-in user's display name (e.g. "Plant"
  // from "Plant Admin"). Falls back to a neutral greeting when no session yet.
  const displayName = session?.user?.name?.trim();
  const firstName = displayName ? displayName.split(/\s+/)[0] : null;

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }
  const chart = data.byLine.map((l) => ({ ...l, line: LINE_LABEL[l.line] ?? l.line }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here&apos;s what&apos;s happening at Tau Power today.
          </p>
        </div>
        {admin && (
          <Button variant="outline" size="sm" onClick={() => reseed.mutate(undefined as never)} disabled={reseed.isPending}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reload demo data
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <SectionLabel>Operations</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Inventory value" value={inr(data.stockValue)} sub={`${data.itemCount} items`} testid="text-kpi-stock-value" tone="emerald" />
          <Kpi label="Open production orders" value={String(data.openOrders)} sub={`${data.inProgress} on shop floor`} testid="text-kpi-open-orders" tone="neutral" />
          <KpiWithTrend
            trend={deltas && (deltas.today.good + deltas.today.reject + deltas.yesterday.good + deltas.yesterday.reject) > 0 ? <StatTrend delta={deltas.deltaGood} suffix="" /> : undefined}
          >
            <Kpi label="Sensors produced (good)" value={qty(data.unitsGood)} sub={`${data.unitsRejected} rejected at EOL`} testid="text-kpi-units" tone="emerald" />
          </KpiWithTrend>
          <KpiWithTrend
            trend={deltas && deltas.deltaFpy !== null ? <StatTrend delta={deltas.deltaFpy} suffix="%" /> : undefined}
          >
            <Kpi label="First-pass yield" value={data.fpy == null ? "—" : `${data.fpy}%`} sub="Completed orders" testid="text-kpi-fpy" tone="neutral" />
          </KpiWithTrend>
        </div>
      </section>

      {sum && (
        <section className="space-y-3">
          <SectionLabel>Sales &amp; supply chain</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Open order book" value={inr(sum.orderBook)} sub={`${sum.openSOs} sales orders${sum.overdue ? ` · ${sum.overdue} overdue` : ""}`} testid="text-kpi-orderbook" tone="emerald" />
            <KpiWithTrend
              trend={
                sum.salesMtdDeltaPct !== null && sum.salesMtdDeltaPct !== undefined
                  ? <StatTrend delta={sum.salesMtdDeltaPct} suffix="%" />
                  : undefined
              }
            >
              <Kpi label="Sales this month (taxable)" value={inr(sum.salesMtd)} sub="vs last month" testid="text-kpi-sales" tone="emerald" />
            </KpiWithTrend>
            <Kpi label="Invoices awaiting IRN" value={String(sum.irnPending)} sub="Upload e-invoice JSON to IRP" testid="text-kpi-irn" tone="sky" />
            <Kpi label="Purchasing" value={`${sum.openPOs} open POs`} sub={`${sum.openIndents} indents to convert`} testid="text-kpi-purchase" tone="sky" />
          </div>
        </section>
      )}

      {p3 && (
        <section className="space-y-3">
          <SectionLabel>Shop floor &amp; quality</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Units on shop floor" value={String(p3.wip + p3.hold)} sub={p3.hold ? `${p3.hold} on hold for rework/scrap` : "None on hold"} testid="text-kpi-wip" tone="neutral" />
            <Kpi label="First-pass yield today" value={p3.fpyToday == null ? "—" : `${p3.fpyToday}%`} sub="Station scans today" testid="text-kpi-fpy-today" tone="neutral" />
            <Kpi label="Quality" value={`${p3.pendingIqc} lots to inspect`} sub={`${p3.openNcrs} open NCRs · ${p3.ppapPending} PPAP not approved`} testid="text-kpi-quality" tone="amber" />
            <Kpi label="Warehouse" value={`${p3.unbinned} to put away`} sub="Stock lines not yet in a bin" testid="text-kpi-putaway" tone="sky" />
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        <SectionCard
          className="lg:col-span-3"
          title="Output by product line"
          right={
            <button onClick={() => go("production")} className="text-xs text-primary hover:underline">Production →</button>
          }
          bodyClassName="h-64 px-2 pb-3"
        >
          {chart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="line" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    fontSize: 12,
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    border: "1px solid var(--border)",
                  }}
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="good" name="Good" stackId="a" fill="var(--chart-1)" cursor="pointer" />
                <Bar dataKey="reject" name="Rejected" stackId="a" fill="var(--chart-5)" radius={[3, 3, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>No completed orders yet</Empty>
          )}
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          title={
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--chart-5)]" aria-hidden />
              Below reorder level
            </span>
          }
          bodyClassName="max-h-64 overflow-y-auto scroll-thin"
        >
          {data.lowStock.length ? (
            <ul className="divide-y">
              {data.lowStock.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-2 text-sm transition-colors hover:bg-muted/40">
                  <div className="min-w-0">
                    <div className="font-mono text-xs">{l.code}</div>
                    <div className="text-xs text-muted-foreground truncate">{l.name}</div>
                  </div>
                  <div className="shrink-0 hidden sm:block" title="Recent stock movement (14 days)">
                    <ReorderSparkline itemId={l.id} />
                  </div>
                  <div className="ml-auto text-right tabular-nums text-xs">
                    <span className="font-semibold text-destructive">{qty(l.onHand)}</span>
                    <span className="text-muted-foreground"> / {qty(l.reorderLevel)} {l.uom}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>All items above reorder level</Empty>
          )}
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <SectionCard
          className="lg:col-span-2"
          title="Recent production orders"
          right={
            <button onClick={() => go("production")} className="text-xs text-primary hover:underline">View all</button>
          }
          bodyClassName="overflow-x-auto scroll-thin"
        >
          <table className="zebra w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium px-5 py-2">Order</th>
                <th className="text-left font-medium px-3">Product</th>
                <th className="text-right font-medium px-3">Qty</th>
                <th className="text-right font-medium px-3">Due</th>
                <th className="text-left font-medium px-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders?.slice(0, 6).map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="px-5 py-2 font-mono text-xs">{o.orderNo}</td>
                  <td className="px-3">{items.get(o.itemId)?.name}</td>
                  <td className="px-3 text-right tabular-nums">{qty(o.qty)}</td>
                  <td className="px-3 text-right tabular-nums text-muted-foreground">{o.dueDate}</td>
                  <td className="px-5"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <ActivityWidget className="lg:col-span-1" />
      </div>

      <ProductionTrendChart days={14} />
    </div>
  );
}
