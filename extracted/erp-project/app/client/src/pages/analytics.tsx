import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction, inr, qty } from "@/lib/erp";
import { PageIntro, Empty } from "@/components/layout";
import { useP4Meta } from "@/components/edoc";

type O = { A: number; P: number; Q: number; oee: number; units: number; good: number; planned: number; downtime: number };
type Oee = { from: string; to: string; plant: O; stations: (O & { station: string; name: string })[]; trend: (O & { date: string })[]; pareto: { reason: string; minutes: number; events: number }[]; today: { units: number; good: number } };
type Fpy = { products: { code: string; name: string; productLine: string; units: number; fpy: number }[]; stations: { station: string; name: string; units: number; fpy: number | null }[]; rty: number };
type Ob = { total: number; byCustomer: { customer: string; value: number }[]; buckets: { bucket: string; value: number; lines: number }[]; overdue: { soNo: string; customer: string; code: string; pending: number; value: number; due: string; daysLate: number }[]; dispatchByWeek: { week: string; value: number }[] };
type Age = { total: number; atJobWorkers: number; buckets: { bucket: string; RM: number; SFG: number; FG: number }[]; oldest: { code: string; name: string; type: string; wh: string; batchNo: string | null; qty: number; value: number; since: string; age: number; bucket: string }[] };
type Ov = { oee: O; rty: number; orderBook: number; overdueLines: number; inventory: number; aged90: number; atJobWorkers: number; jwDue30: number; jwOverdue: number; itc04: { label: string; due: string; days: number }; irnPending: number };

const ax = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }, labelStyle: { color: "hsl(var(--foreground))" } };
const dm = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const lakh = (n: number) => n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : inr(n);
const tone = (v: number, good: number, ok: number) => v >= good ? "text-emerald-700 dark:text-emerald-400" : v >= ok ? "text-[hsl(var(--chart-2))]" : "text-destructive";

function Kpi({ label, value, sub, testId, cls = "" }: { label: string; value: string; sub?: string; testId: string; cls?: string }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-xl font-semibold tabular-nums mt-1 ${cls}`} data-testid={testId}>{value}</div>{sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}</CardContent></Card>;
}

function DowntimeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const meta = useP4Meta().data;
  const [f, setF] = useState({ date: "", station: "", minutes: "", reason: "", note: "" });
  useEffect(() => { if (open) setF({ date: new Date().toISOString().slice(0, 10), station: "", minutes: "", reason: "", note: "" }); }, [open]);
  const save = useAction("POST", "/api/analytics/downtime", "Downtime logged");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log downtime</DialogTitle><DialogDescription>Stoppages reduce availability in the OEE calculation.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} data-testid="input-dt-date" /></div>
          <div className="space-y-1"><Label>Minutes</Label><Input inputMode="numeric" value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value.replace(/\D/g, "") })} data-testid="input-dt-minutes" /></div>
          <div className="space-y-1 col-span-2"><Label>Station</Label>
            <Select value={f.station} onValueChange={v => setF({ ...f, station: v })}><SelectTrigger data-testid="select-dt-station"><SelectValue placeholder="Choose station" /></SelectTrigger>
              <SelectContent>{Object.entries(meta?.stations ?? {}).map(([k, v]) => <SelectItem key={k} value={k}>{k} — {v}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 col-span-2"><Label>Reason</Label>
            <Select value={f.reason} onValueChange={v => setF({ ...f, reason: v })}><SelectTrigger data-testid="select-dt-reason"><SelectValue placeholder="Choose reason" /></SelectTrigger>
              <SelectContent>{(meta?.downtimeReasons ?? []).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 col-span-2"><Label>Note</Label><Input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} data-testid="input-dt-note" /></div>
        </div>
        <DialogFooter><Button disabled={save.isPending || !f.station || !f.reason || !+f.minutes} onClick={() => save.mutate({ ...f, minutes: +f.minutes }, { onSuccess: () => onOpenChange(false) })} data-testid="button-save-downtime">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductionTab() {
  const oee = useQuery<Oee>({ queryKey: ["/api/analytics/oee"] }).data;
  const fpy = useQuery<Fpy>({ queryKey: ["/api/analytics/fpy"] }).data;
  const [dtOpen, setDtOpen] = useState(false);
  if (!oee || !fpy) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">OEE trend — last 14 days</CardTitle><p className="text-xs text-muted-foreground">OEE = availability × performance × quality, all stations, completed shifts only.</p></CardHeader>
          <CardContent className="h-64"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={oee.trend.map(t => ({ ...t, d: dm(t.date) }))} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="d" tick={ax} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tick={ax} tickLine={false} axisLine={false} unit="%" />
              <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(1)}%`} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="oee" name="OEE" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
              <Line dataKey="A" name="Availability" stroke="hsl(var(--chart-3))" dot={false} strokeWidth={2} />
              <Line dataKey="P" name="Performance" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} />
              <Line dataKey="Q" name="Quality" stroke="hsl(var(--chart-4))" dot={false} strokeWidth={2} />
            </ComposedChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-1 flex-row items-center"><div><CardTitle className="text-sm font-semibold">Downtime by reason</CardTitle><p className="text-xs text-muted-foreground">Minutes lost, last 14 days</p></div>
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setDtOpen(true)} data-testid="button-log-downtime"><Plus className="h-3.5 w-3.5 mr-1" />Log downtime</Button></CardHeader>
          <CardContent className="h-64">{!oee.pareto.length ? <Empty>No downtime logged.</Empty> : <ResponsiveContainer width="100%" height="100%">
            <BarChart data={oee.pareto} layout="vertical" margin={{ left: 40, right: 16, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={ax} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="reason" tick={ax} tickLine={false} axisLine={false} width={110} />
              <Tooltip {...tip} formatter={(v: number, _n, p: any) => [`${v} min · ${p.payload.events} stops`, "Lost"]} />
              <Bar dataKey="minutes" fill="hsl(var(--chart-2))" radius={[0, 3, 3, 0]} />
            </BarChart></ResponsiveContainer>}</CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">OEE by station</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-y bg-muted/40 text-xs text-muted-foreground"><th className="text-left font-medium px-4 py-2">Station</th><th className="text-right font-medium px-3">Units</th><th className="text-right font-medium px-3">Downtime</th><th className="text-right font-medium px-3">Availability</th><th className="text-right font-medium px-3">Performance</th><th className="text-right font-medium px-3">Quality (first pass)</th><th className="text-right font-medium px-3">OEE</th><th className="px-4 w-40" /></tr></thead>
          <tbody>{oee.stations.map(s => (
            <tr key={s.station} className="border-b last:border-0" data-testid={`row-oee-${s.station}`}>
              <td className="px-4 py-2"><span className="font-mono text-xs">{s.station}</span><div className="text-[11px] text-muted-foreground">{s.name}</div></td>
              <td className="px-3 text-right tabular-nums">{qty(s.units)}</td><td className="px-3 text-right tabular-nums text-xs">{Math.round(s.downtime)} min</td>
              <td className="px-3 text-right tabular-nums">{s.A.toFixed(1)}%</td><td className="px-3 text-right tabular-nums">{s.P.toFixed(1)}%</td><td className="px-3 text-right tabular-nums">{s.Q.toFixed(1)}%</td>
              <td className={`px-3 text-right tabular-nums font-semibold ${tone(s.oee, 75, 60)}`}>{s.oee.toFixed(1)}%</td>
              <td className="px-4"><div className="h-1.5 rounded bg-muted overflow-hidden"><div className="h-full bg-[hsl(var(--chart-1))]" style={{ width: `${s.oee}%` }} /></div></td>
            </tr>))}</tbody></table></CardContent></Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">First-pass yield by product (EOL test, 30 days)</CardTitle></CardHeader>
          <CardContent className="p-0">{!fpy.products.length ? <Empty>No serialised production in this period.</Empty> : <table className="w-full text-sm">
            <thead><tr className="border-y bg-muted/40 text-xs text-muted-foreground"><th className="text-left font-medium px-4 py-2">Product</th><th className="text-right font-medium px-3">Units</th><th className="text-right font-medium px-4">FPY</th></tr></thead>
            <tbody>{fpy.products.map(p => <tr key={p.code} className="border-b last:border-0"><td className="px-4 py-2"><span className="font-mono text-xs">{p.code}</span><div className="text-[11px] text-muted-foreground">{p.name}</div></td><td className="px-3 text-right tabular-nums">{qty(p.units)}</td><td className={`px-4 text-right tabular-nums font-medium ${tone(p.fpy, 97, 93)}`}>{p.fpy.toFixed(1)}%</td></tr>)}</tbody></table>}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">First-pass yield by station</CardTitle><p className="text-xs text-muted-foreground">Rolled throughput yield across all stations: <b className="text-foreground" data-testid="text-rty">{fpy.rty.toFixed(1)}%</b></p></CardHeader>
          <CardContent className="h-56"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={fpy.stations.filter(s => s.fpy != null)} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="station" tick={ax} tickLine={false} axisLine={false} /><YAxis domain={[90, 100]} tick={ax} tickLine={false} axisLine={false} unit="%" allowDataOverflow />
              <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Bar dataKey="fpy" name="FPY" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></CardContent></Card>
      </div>
      <p className="text-[11px] text-muted-foreground">Earlier days come from demo daily station history; today's live shop-floor scans ({oee.today.units} operations so far) are added once the shift ends. Planned time per station is set in Tally & Company.</p>
      <DowntimeDialog open={dtOpen} onOpenChange={setDtOpen} />
    </div>
  );
}

function SalesTab() {
  const ob = useQuery<Ob>({ queryKey: ["/api/analytics/order-book"] }).data;
  if (!ob) return <Skeleton className="h-96" />;
  const max = Math.max(1, ...ob.byCustomer.map(c => c.value));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-4 gap-3">{ob.buckets.map(b => <Kpi key={b.bucket} label={b.bucket} value={lakh(b.value)} sub={`${b.lines} line${b.lines === 1 ? "" : "s"}`} testId={`kpi-ob-${b.bucket}`} cls={b.bucket === "Overdue" && b.value ? "text-destructive" : ""} />)}</div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Open order book by customer</CardTitle><p className="text-xs text-muted-foreground">Pending quantity × rate · total {inr(ob.total)}</p></CardHeader>
          <CardContent className="space-y-3">{ob.byCustomer.map(c => <div key={c.customer} className="space-y-1"><div className="flex text-sm"><span>{c.customer}</span><span className="ml-auto tabular-nums font-medium">{inr(c.value)}</span></div><div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-[hsl(var(--chart-1))]" style={{ width: `${c.value / max * 100}%` }} /></div></div>)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Dispatches per week (taxable value)</CardTitle></CardHeader>
          <CardContent className="h-60"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={ob.dispatchByWeek.map(w => ({ ...w, w: dm(w.week) }))} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="w" tick={ax} tickLine={false} axisLine={false} /><YAxis tick={ax} tickLine={false} axisLine={false} tickFormatter={lakh} width={56} />
              <Tooltip {...tip} formatter={(v: number) => inr(v)} labelFormatter={l => `Week from ${l}`} />
              <Bar dataKey="value" name="Dispatched" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Overdue order lines</CardTitle></CardHeader>
        <CardContent className="p-0">{!ob.overdue.length ? <Empty>No order lines are past their delivery date.</Empty> : <table className="w-full text-sm">
          <thead><tr className="border-y bg-muted/40 text-xs text-muted-foreground"><th className="text-left font-medium px-4 py-2">SO</th><th className="text-left font-medium px-3">Customer</th><th className="text-left font-medium px-3">Item</th><th className="text-right font-medium px-3">Pending</th><th className="text-right font-medium px-3">Value</th><th className="text-right font-medium px-4">Late</th></tr></thead>
          <tbody>{ob.overdue.map((o, i) => <tr key={i} className="border-b last:border-0"><td className="px-4 py-2 font-mono text-xs">{o.soNo}</td><td className="px-3">{o.customer}</td><td className="px-3 font-mono text-xs">{o.code}</td><td className="px-3 text-right tabular-nums">{qty(o.pending)}</td><td className="px-3 text-right tabular-nums">{inr(o.value)}</td><td className="px-4 text-right tabular-nums text-destructive">{o.daysLate} d</td></tr>)}</tbody></table>}</CardContent></Card>
    </div>
  );
}

function InventoryTab() {
  const a = useQuery<Age>({ queryKey: ["/api/analytics/ageing"] }).data;
  if (!a) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Kpi label="Inventory value (excl. WIP)" value={lakh(a.total)} testId="kpi-inv-total" />
        <Kpi label="Older than 90 days" value={lakh(a.buckets[3].RM + a.buckets[3].SFG + a.buckets[3].FG)} sub="Slow-moving — review" testId="kpi-inv-90" />
        <Kpi label="At job workers" value={inr(a.atJobWorkers)} sub="Owned, not available" testId="kpi-inv-jw" />
      </div>
      <div className="grid 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Stock value by age</CardTitle><p className="text-xs text-muted-foreground">Days since each batch was first received or produced</p></CardHeader>
          <CardContent className="h-64"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={a.buckets} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="bucket" tick={ax} tickLine={false} axisLine={false} /><YAxis tick={ax} tickLine={false} axisLine={false} tickFormatter={lakh} width={56} />
              <Tooltip {...tip} formatter={(v: number) => inr(v)} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="RM" name="Raw material" stackId="a" fill="hsl(var(--chart-1))" />
              <Bar dataKey="SFG" name="Semi-finished" stackId="a" fill="hsl(var(--chart-4))" />
              <Bar dataKey="FG" name="Finished goods" stackId="a" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Oldest batches</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-y bg-muted/40 text-xs text-muted-foreground"><th className="text-left font-medium px-4 py-2">Item</th><th className="text-left font-medium px-3">Store</th><th className="text-left font-medium px-3">Batch</th><th className="text-right font-medium px-3">Qty</th><th className="text-right font-medium px-3">Value</th><th className="text-right font-medium px-4">Age</th></tr></thead>
            <tbody>{a.oldest.map((r, i) => <tr key={i} className="border-b last:border-0"><td className="px-4 py-1.5"><span className="font-mono text-xs">{r.code}</span><div className="text-[11px] text-muted-foreground truncate max-w-56">{r.name}</div></td><td className="px-3 font-mono text-xs">{r.wh}</td><td className="px-3 font-mono text-xs">{r.batchNo ?? "-"}</td><td className="px-3 text-right tabular-nums">{qty(r.qty)}</td><td className="px-3 text-right tabular-nums">{inr(r.value)}</td><td className={`px-4 text-right tabular-nums ${r.age > 90 ? "text-destructive font-medium" : ""}`}>{r.age} d</td></tr>)}</tbody></table></CardContent></Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const ov = useQuery<Ov>({ queryKey: ["/api/analytics/overview"] }).data;
  return (
    <>
      <PageIntro>Plant performance at a glance: equipment effectiveness and yield from the shop floor, order book from sales, stock ageing from inventory, and GST compliance deadlines.</PageIntro>
      {!ov ? <Skeleton className="h-24 mb-4" /> : <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        <Kpi label="OEE (14 days)" value={`${ov.oee.oee.toFixed(1)}%`} sub={`A ${ov.oee.A.toFixed(0)} · P ${ov.oee.P.toFixed(0)} · Q ${ov.oee.Q.toFixed(0)}`} testId="kpi-oee" cls={tone(ov.oee.oee, 75, 60)} />
        <Kpi label="Rolled yield (30 days)" value={`${ov.rty.toFixed(1)}%`} sub="All stations, first pass" testId="kpi-rty" />
        <Kpi label="Open order book" value={lakh(ov.orderBook)} sub={ov.overdueLines ? `${ov.overdueLines} lines overdue` : "Nothing overdue"} testId="kpi-orderbook" />
        <Kpi label="Inventory" value={lakh(ov.inventory)} sub={`${lakh(ov.aged90)} older than 90 days`} testId="kpi-inventory" />
        <Link href="/jobwork" className="block"><Kpi label={`ITC-04 · ${ov.itc04.label}`} value={`${ov.itc04.days} days`} sub={`Due ${ov.itc04.due.split("-").reverse().join("/")}`} testId="kpi-itc04" cls={ov.itc04.days <= 15 ? "text-[hsl(var(--chart-2))]" : ""} /></Link>
        <Link href="/jobwork" className="block"><Kpi label="Job work" value={ov.jwOverdue ? `${ov.jwOverdue} overdue` : `${ov.jwDue30} due soon`} sub={`${inr(ov.atJobWorkers)} at job workers`} testId="kpi-jobwork" cls={ov.jwOverdue ? "text-destructive" : ""} /></Link>
      </div>}
      <Tabs defaultValue="prod">
        <TabsList><TabsTrigger value="prod" data-testid="tab-an-prod">Production (OEE & yield)</TabsTrigger><TabsTrigger value="sales" data-testid="tab-an-sales">Order book</TabsTrigger><TabsTrigger value="inv" data-testid="tab-an-inv">Inventory ageing</TabsTrigger></TabsList>
        <TabsContent value="prod"><ProductionTab /></TabsContent>
        <TabsContent value="sales"><SalesTab /></TabsContent>
        <TabsContent value="inv"><InventoryTab /></TabsContent>
      </Tabs>
    </>
  );
}
