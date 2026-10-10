import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type Dashboard, inr, qty, useOrders, useItems, lookup, LINE_LABEL } from "@/lib/erp";
import { StatusBadge, Empty } from "@/components/layout";
import { AlertTriangle } from "lucide-react";

function Kpi({ label, value, sub, testid }: { label: string; value: string; sub?: string; testid: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums" data-testid={testid}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </CardContent></Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<Dashboard>({ queryKey: ["/api/dashboard"] });
  const { data: orders } = useOrders();
  const p3 = useQuery<{ wip: number; hold: number; fpyToday: number | null; pendingIqc: number; openNcrs: number; unbinned: number; ppapPending: number }>({ queryKey: ["/api/phase3/summary"] }).data;
  const sum = useQuery<{ orderBook: number; openSOs: number; overdue: number; salesMtd: number; irnPending: number; openIndents: number; openPOs: number }>({ queryKey: ["/api/summary"] }).data;
  const items = lookup(useItems().data);
  if (isLoading || !data) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  const chart = data.byLine.map(l => ({ ...l, line: LINE_LABEL[l.line] ?? l.line }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Inventory value" value={inr(data.stockValue)} sub={`${data.itemCount} items`} testid="text-kpi-stock-value" />
        <Kpi label="Open production orders" value={String(data.openOrders)} sub={`${data.inProgress} on shop floor`} testid="text-kpi-open-orders" />
        <Kpi label="Sensors produced (good)" value={qty(data.unitsGood)} sub={`${data.unitsRejected} rejected at EOL`} testid="text-kpi-units" />
        <Kpi label="First-pass yield" value={data.fpy == null ? "—" : `${data.fpy}%`} sub="Completed orders" testid="text-kpi-fpy" />
      </div>
      {sum && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Open order book" value={inr(sum.orderBook)} sub={`${sum.openSOs} sales orders${sum.overdue ? ` · ${sum.overdue} overdue` : ""}`} testid="text-kpi-orderbook" />
        <Kpi label="Sales this month (taxable)" value={inr(sum.salesMtd)} testid="text-kpi-sales" />
        <Kpi label="Invoices awaiting IRN" value={String(sum.irnPending)} sub="Upload e-invoice JSON to IRP" testid="text-kpi-irn" />
        <Kpi label="Purchasing" value={`${sum.openPOs} open POs`} sub={`${sum.openIndents} indents to convert`} testid="text-kpi-purchase" />
      </div>}
      {p3 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Units on shop floor" value={String(p3.wip + p3.hold)} sub={p3.hold ? `${p3.hold} on hold for rework/scrap` : "None on hold"} testid="text-kpi-wip" />
        <Kpi label="First-pass yield today" value={p3.fpyToday == null ? "—" : `${p3.fpyToday}%`} sub="Station scans today" testid="text-kpi-fpy-today" />
        <Kpi label="Quality" value={`${p3.pendingIqc} lots to inspect`} sub={`${p3.openNcrs} open NCRs · ${p3.ppapPending} PPAP not approved`} testid="text-kpi-quality" />
        <Kpi label="Warehouse" value={`${p3.unbinned} to put away`} sub="Stock lines not yet in a bin" testid="text-kpi-putaway" />
      </div>}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Output by product line</CardTitle></CardHeader>
          <CardContent className="h-64">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="line" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="good" name="Good" stackId="a" fill="hsl(var(--chart-1))" />
                  <Bar dataKey="reject" name="Rejected" stackId="a" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty>No completed orders yet</Empty>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[hsl(var(--chart-2))]" />Below reorder level</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.lowStock.length ? (
              <ul className="divide-y">
                {data.lowStock.map(l => (
                  <li key={l.id} className="flex items-center gap-3 px-6 py-2 text-sm" data-testid={`row-lowstock-${l.id}`}>
                    <div className="min-w-0">
                      <div className="font-mono text-xs">{l.code}</div>
                      <div className="text-xs text-muted-foreground truncate">{l.name}</div>
                    </div>
                    <div className="ml-auto text-right tabular-nums text-xs"><span className="font-semibold text-destructive">{qty(l.onHand)}</span><span className="text-muted-foreground"> / {qty(l.reorderLevel)} {l.uom}</span></div>
                  </li>
                ))}
              </ul>
            ) : <Empty>All items above reorder level</Empty>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2 flex-row items-center"><CardTitle className="text-sm font-semibold">Recent production orders</CardTitle><Link href="/production" className="ml-auto text-xs text-primary hover:underline" data-testid="link-all-orders">View all</Link></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left font-medium px-6 py-2">Order</th><th className="text-left font-medium px-3">Product</th><th className="text-right font-medium px-3">Qty</th><th className="text-left font-medium px-3">Due</th><th className="text-left font-medium px-6">Status</th></tr></thead>
            <tbody>
              {orders?.slice(0, 6).map(o => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="px-6 py-2 font-mono text-xs">{o.orderNo}</td>
                  <td className="px-3">{items.get(o.itemId)?.name}</td>
                  <td className="px-3 text-right tabular-nums">{qty(o.qty)}</td>
                  <td className="px-3 tabular-nums text-muted-foreground">{o.dueDate}</td>
                  <td className="px-6"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
