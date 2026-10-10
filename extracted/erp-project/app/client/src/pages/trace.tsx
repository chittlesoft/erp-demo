import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useItems, lookup, qty, LINE_LABEL, type Serial, type ProductionOrder, type Item } from "@/lib/erp";
import { PageIntro, StatusBadge, Empty } from "@/components/layout";

type SerialTrace = { serial: Serial; item: Item; order: ProductionOrder; components: { itemId: number; batchNo: string | null; qty: number; item?: Item }[]; dispatch: { invNo: string; date: string; customer: string } | null } | null;
type BatchTrace = { order: ProductionOrder; item: Item; serials: Serial[] }[];

type Hist = { seq: number; op: string; station: string; operator: string; result: string; data: Record<string, any>; reason: string | null; ts: string }[];
function StationHistory({ sn }: { sn: string }) {
  const { data } = useQuery<Hist>({ queryKey: ["/api/mes/history", sn] });
  if (!data?.length) return null;
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Shop-floor history (station by station)</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto"><table className="w-full text-xs min-w-[640px]"><tbody>{data.map((l, i) => (
        <tr key={i} className="border-t"><td className="px-6 py-1.5 font-mono">{l.seq}</td><td className="px-2 font-mono">{l.station}</td><td className="px-2">{l.operator}</td><td className="px-2"><StatusBadge status={l.result} /></td>
          <td className="px-2 text-muted-foreground">{Object.entries(l.data).map(([k, v]) => `${k}=${v === true ? "OK" : v}`).join(" · ") || l.reason || ""}</td><td className="px-6 text-right tabular-nums text-muted-foreground">{l.ts}</td></tr>))}</tbody></table></CardContent>
    </Card>
  );
}

function WipResult({ sn }: { sn: string }) {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/mes/unit", sn] });
  if (isLoading) return <Skeleton className="h-32" />;
  if (!data) return <Card><Empty>No sensor found with serial {sn}</Empty></Card>;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><span className="font-mono" data-testid="text-trace-serial">{data.unit.serial_no}</span><StatusBadge status={data.unit.status} /></CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <Row k="Product" v={`${data.item.name} (${data.item.code})`} /><Row k="Production order" v={data.order.orderNo} mono />
          <Row k="Status" v={data.unit.status === "DONE" ? "All operations complete — awaiting order close" : data.unit.status === "SCRAP" ? "Scrapped on shop floor" : `On shop floor at op ${data.current?.seq} ${data.current?.name}`} />
        </CardContent></Card>
      <StationHistory sn={sn} />
    </div>
  );
}

function SerialResult({ sn }: { sn: string }) {
  const { data, isLoading } = useQuery<SerialTrace>({ queryKey: ["/api/trace/serial", sn] });
  if (isLoading) return <Skeleton className="h-48" />;
  if (!data) return <WipResult sn={sn} />;
  const eol = JSON.parse(data.serial.eolData) as Record<string, string>;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><span className="font-mono" data-testid="text-trace-serial">{data.serial.serialNo}</span><StatusBadge status={data.serial.eolResult} /></CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <Row k="Product" v={`${data.item.name} (${data.item.code})`} />
          <Row k="Product line" v={data.item.productLine ? LINE_LABEL[data.item.productLine] : "—"} />
          <Row k="OEM part no." v={data.item.customerPartNo ?? "—"} />
          <Row k="Production order" v={data.order.orderNo} mono />
          <Row k="Manufactured" v={data.serial.date} />
          <Row k="Status" v={data.dispatch ? `Dispatched ${data.dispatch.date} to ${data.dispatch.customer}` : data.serial.status === "REJECTED" ? "Rejected at EOL" : "In finished goods stock"} />
          {data.dispatch && <Row k="Invoice" v={data.dispatch.invNo} mono />}
          <div className="pt-3 text-xs font-medium text-muted-foreground">End-of-line test values</div>
          {Object.entries(eol).map(([k, v]) => <Row key={k} k={k} v={v} mono warn={v.includes("out of spec")} />)}
          <p className="text-[11px] text-muted-foreground pt-1">Values recorded at the calibration / EOL station (demo values for sensors built before shop-floor tracking).</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Component batches in this build</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm"><tbody>{data.components.map((c, i) => (
            <tr key={i} className="border-t"><td className="px-6 py-2"><span className="font-mono text-xs">{c.item?.code}</span><div className="text-xs text-muted-foreground">{c.item?.name}</div></td>
              <td className="px-3 font-mono text-xs">{c.batchNo ?? "untracked"}</td><td className="px-6 text-right tabular-nums text-xs text-muted-foreground">{qty(c.qty)} for order</td></tr>))}</tbody></table>
        </CardContent>
      </Card>
      <StationHistory sn={data.serial.serialNo} />
    </div>
  );
}

function BatchResult({ bn }: { bn: string }) {
  const { data, isLoading } = useQuery<BatchTrace>({ queryKey: ["/api/trace/batch", bn] });
  if (isLoading) return <Skeleton className="h-48" />;
  if (!data?.length) return <Card><Empty>Batch {bn} has not been consumed in any production order</Empty></Card>;
  const total = data.reduce((s, d) => s + d.serials.length, 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold" data-testid="text-batch-impact">Batch <span className="font-mono">{bn}</span> went into {data.length} order{data.length > 1 ? "s" : ""} · {total} serialised sensors</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data.map(d => (
          <div key={d.order.id}>
            <div className="text-sm"><span className="font-mono text-xs">{d.order.orderNo}</span> · {d.item.name} · <StatusBadge status={d.order.status} /></div>
            {d.serials.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{d.serials.slice(0, 60).map(s => <span key={s.id} className={`font-mono text-[11px] rounded border px-1.5 py-0.5 ${s.eolResult === "FAIL" ? "text-destructive border-destructive/40" : ""}`}>{s.serialNo}</span>)}{d.serials.length > 60 && <span className="text-xs text-muted-foreground">+{d.serials.length - 60} more</span>}</div>}
          </div>))}
      </CardContent>
    </Card>
  );
}

const Row = ({ k, v, mono, warn }: { k: string; v: string; mono?: boolean; warn?: boolean }) => (
  <div className="flex gap-4"><span className="text-muted-foreground w-40 shrink-0">{k}</span><span className={`${mono ? "font-mono text-xs" : ""} ${warn ? "text-destructive font-medium" : ""}`}>{v}</span></div>
);

export default function TracePage() {
  const serials = useQuery<Serial[]>({ queryKey: ["/api/serials"] });
  const items = lookup(useItems().data);
  const [mode, setMode] = useState("serial");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<{ mode: string; v: string } | null>(null);
  const run = (v = input, m = mode) => v.trim() && setQuery({ mode: m, v: v.trim().toUpperCase() });
  return (
    <>
      <PageIntro>Forward and backward traceability for OEM audits and field returns: sensor serial → component batches, or supplier batch → every affected sensor.</PageIntro>
      <Tabs value={mode} onValueChange={m => { setMode(m); setQuery(null); setInput(""); }}>
        <TabsList><TabsTrigger value="serial" data-testid="tab-trace-serial">By sensor serial</TabsTrigger><TabsTrigger value="batch" data-testid="tab-trace-batch">By material batch</TabsTrigger></TabsList>
        <form className="flex gap-2 my-4 max-w-xl" onSubmit={e => { e.preventDefault(); run(); }}>
          <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8 font-mono" placeholder={mode === "serial" ? "e.g. NOX-2609-00012" : "e.g. ZN-2609-014"} value={input} onChange={e => setInput(e.target.value)} data-testid="input-trace" /></div>
          <Button type="submit" data-testid="button-trace">Trace</Button>
        </form>
        <TabsContent value="serial">{query?.mode === "serial" ? <SerialResult sn={query.v} /> : (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recently built sensors</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">{serials.data?.slice(0, 40).map(s => (
              <button key={s.id} onClick={() => { setInput(s.serialNo); run(s.serialNo, "serial"); }} className={`font-mono text-[11px] rounded border px-2 py-1 hover:bg-muted ${s.eolResult === "FAIL" ? "text-destructive border-destructive/40" : ""}`} data-testid={`button-serial-${s.id}`} title={items.get(s.itemId)?.name}>{s.serialNo}</button>))}</CardContent></Card>)}
        </TabsContent>
        <TabsContent value="batch">{query?.mode === "batch" ? <BatchResult bn={query.v} /> : <Card><Empty>Enter a supplier batch / lot number, e.g. ZN-2609-014 or PZ-2609-007</Empty></Card>}</TabsContent>
      </Tabs>
    </>
  );
}
