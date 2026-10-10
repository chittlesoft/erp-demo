"use client";
import { useApi, inr2, qty } from "@/lib/erp/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro, Empty, Kpi, SectionCard } from "../shared";
import { ProductionTrendChart } from "../production-trend-chart";

type Analytics = {
  oee: { station: string; scans: number; pass: number; oee: number }[];
  fpyByProduct: { line: string; good: number; reject: number; fpy: number }[];
  orderBook: { customer: string; soNo: string; value: number; bucket: string; due: string }[];
  ageing: { "0-30": number; "31-60": number; "61-90": number; "90+": number };
  oldestBatches: { code: string; batch: string; age: number; qty: number; value: number }[];
  wipTotal: number;
  scrapTotal: number;
};

const AGEING_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-2)", "var(--chart-5)"];

/** Theme-aware recharts Tooltip — adapts to dark mode via CSS variables. */
const TOOLTIP_STYLE = {
  borderRadius: 8,
  fontSize: 12,
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
} as const;

const CHART_CURSOR = { fill: "var(--muted)", fillOpacity: 0.5 } as const;

export default function AnalyticsPage() {
  const { data, isLoading } = useApi<Analytics>("/api/analytics");
  if (isLoading || !data) return <Skeleton className="h-64" />;
  const ageingData = [
    { bucket: "0-30 days", value: Math.round(data.ageing["0-30"]) },
    { bucket: "31-60", value: Math.round(data.ageing["31-60"]) },
    { bucket: "61-90", value: Math.round(data.ageing["61-90"]) },
    { bucket: "90+", value: Math.round(data.ageing["90+"]) },
  ];
  const bucketOrder = ["Overdue", "0-7 days", "8-30 days", "30+ days"];

  return (
    <>
      <PageIntro>Management dashboards — OEE by station, first-pass yield by product, order book by due bucket, inventory ageing.</PageIntro>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Kpi label="Shop-floor WIP" value={String(data.wipTotal)} sub={`${data.scrapTotal} scrapped`} tone="neutral" />
        <Kpi label="Order-book lines" value={String(data.orderBook.length)} accent="text-primary" tone="emerald" />
        <Kpi label="Inventory ageing 90+" value={inr2(data.ageing["90+"])} accent="text-destructive" tone="rose" />
        <Kpi label="Stations tracked" value={String(data.oee.length)} tone="neutral" />
      </div>

      <ProductionTrendChart days={14} className="mb-4" />

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard
          title="OEE by station"
          subtitle="Availability × Performance × Quality"
          bodyClassName="h-64 px-2 pb-3"
        >
          {data.oee.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.oee} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.35} vertical={false} />
                <XAxis dataKey="station" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                <Bar dataKey="oee" name="OEE %" radius={[3, 3, 0, 0]} cursor="pointer"><Cell fill="var(--chart-1)" /></Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>No scans yet</Empty>}
        </SectionCard>

        <SectionCard title="First-pass yield by product" bodyClassName="h-64 px-2 pb-3">
          {data.fpyByProduct.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.fpyByProduct} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.35} vertical={false} />
                <XAxis dataKey="line" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="good" name="Good" stackId="a" fill="var(--chart-1)" cursor="pointer" />
                <Bar dataKey="reject" name="Rejected" stackId="a" fill="var(--chart-5)" radius={[3, 3, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>No completed orders</Empty>}
        </SectionCard>

        <SectionCard
          title="Inventory ageing"
          subtitle="Stock value by age band"
          bodyClassName="h-64 px-2 pb-3"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ageingData} margin={{ left: -16, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.35} vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CHART_CURSOR} formatter={(v: number) => inr2(v)} />
              <Bar dataKey="value" name="Value" radius={[3, 3, 0, 0]} cursor="pointer">{ageingData.map((_, i) => <Cell key={i} fill={AGEING_COLORS[i]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Oldest batches" bodyClassName="max-h-64 overflow-y-auto scroll-thin">
          {data.oldestBatches.length === 0 ? <Empty>No stock</Empty> : (
            <table className="zebra w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  {["Code", "Batch", "Age", "Qty", "Value"].map((h, i) => (
                    <th key={i} className={`font-medium px-5 py-1.5 ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.oldestBatches.map((b, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-5 py-1.5 font-mono text-xs">{b.code}</td>
                    <td className="px-5 font-mono text-xs">{b.batch || "—"}</td>
                    <td className="px-5 text-right tabular-nums">{b.age}d</td>
                    <td className="px-5 text-right tabular-nums">{qty(b.qty)}</td>
                    <td className="px-5 text-right tabular-nums">{inr2(b.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      <SectionCard
        className="mt-4"
        title="Order book by due bucket"
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {data.orderBook.length === 0 ? <Empty>No open orders</Empty> : (
          <table className="zebra w-full text-sm table-compact">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium px-5 py-2">SO</th>
                <th className="text-left font-medium px-5 py-2">Customer</th>
                <th className="text-left font-medium px-5 py-2">Due</th>
                <th className="text-left font-medium px-5 py-2">Bucket</th>
                <th className="text-right font-medium px-5 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {[...data.orderBook].sort((a, b) => bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket)).map((o, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-5 py-2 font-mono text-xs">{o.soNo}</td>
                  <td className="px-5">{o.customer}</td>
                  <td className="px-5 text-xs tabular-nums">{o.due}</td>
                  <td className="px-5"><span className={`text-xs font-medium ${o.bucket === "Overdue" ? "text-destructive" : "text-muted-foreground"}`}>{o.bucket}</span></td>
                  <td className="px-5 text-right tabular-nums">{inr2(o.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
