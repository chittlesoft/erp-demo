import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Printer, PackagePlus, ClipboardCheck, ArrowRightLeft, Tag } from "lucide-react";
import { LabelsDialog } from "@/components/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWarehouses, useOrders, useItems, useAction, lookup, qty, inr, type SoRow } from "@/lib/erp";
import { PageIntro, Empty } from "@/components/layout";

type Bin = { id: number; code: string; warehouse_id: number; zone: string; whCode: string };
type BinRow = { binId: number; bin: string; itemId: number; itemCode: string; itemName: string; uom: string; warehouseId: number; batchNo: string | null; qty: number; cost: number };
type Unbinned = { itemId: number; itemCode: string; itemName: string; uom: string; warehouseId: number; batchNo: string | null; qty: number };
type Pick = { ref: string; title: string; rows: { itemCode: string; itemName: string; uom: string; required: number; lines: { batchNo: string | null; bin: string; qty: number }[]; short: number }[] };
const errMsg = (e: any) => { let m = String(e?.message ?? e).replace(/^\d+:\s*/, ""); try { m = JSON.parse(m).message ?? m; } catch {} return m; };

function MoveLine({ r, bins }: { r: BinRow; bins: Bin[] }) {
  const [to, setTo] = useState(""); const [q, setQ] = useState(String(r.qty));
  useEffect(() => setQ(String(r.qty)), [r.qty]);
  const move = useAction("POST", "/api/wms/move", "Moved");
  const targets = bins.filter(b => b.warehouse_id === r.warehouseId && b.id !== r.binId);
  const n = +q;
  return (
    <tr className="border-t" data-testid={`row-move-${r.itemCode}`}>
      <td className="py-2"><div className="font-mono text-xs">{r.itemCode}</div><div className="text-[11px] text-muted-foreground">{r.itemName}</div></td>
      <td className="font-mono text-xs px-2">{r.batchNo ?? "—"}</td>
      <td className="text-right tabular-nums px-2 whitespace-nowrap">{qty(r.qty)} {r.uom}</td>
      <td className="px-2 w-32"><Select value={to} onValueChange={setTo}><SelectTrigger className="h-8" data-testid={`select-move-to-${r.itemCode}`}><SelectValue placeholder="To bin" /></SelectTrigger>
        <SelectContent>{targets.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.code}</SelectItem>)}</SelectContent></Select></td>
      <td className="px-2 w-20"><Input className="h-8 text-right" type="number" min="0" max={r.qty} value={q} onChange={e => setQ(e.target.value)} data-testid={`input-move-qty-${r.itemCode}`} /></td>
      <td className="text-right"><Button size="sm" disabled={!to || !(n > 0) || n > r.qty || move.isPending} onClick={() => move.mutate({ itemId: r.itemId, batchNo: r.batchNo, fromBinId: r.binId, toBinId: +to, qty: n }, { onSuccess: () => setTo("") })} data-testid={`button-move-${r.itemCode}`}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Move</Button></td>
    </tr>
  );
}

function BinDialog({ bin, bins, stock, onClose }: { bin: Bin | null; bins: Bin[]; stock: BinRow[]; onClose: () => void }) {
  if (!bin) return null;
  const rows = stock.filter(s => s.binId === bin.id);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="font-mono">{bin.code}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">{bin.zone || "General"} · move stock to another bin in the same store. The stock ledger is unchanged; only the location moves.</p>
        {rows.length ? (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium py-1">Item</th><th className="text-left font-medium px-2">Batch</th><th className="text-right font-medium px-2">In bin</th><th className="text-left font-medium px-2">To</th><th className="text-right font-medium px-2">Qty</th><th /></tr></thead>
            <tbody>{rows.map(r => <MoveLine key={`${r.itemId}-${r.batchNo}`} r={r} bins={bins} />)}</tbody>
          </table></div>
        ) : <p className="text-sm py-6 text-center text-muted-foreground">This bin is empty.</p>}
      </DialogContent>
    </Dialog>
  );
}

function BinsTab() {
  const whs = useWarehouses().data ?? [];
  const bins = useQuery<Bin[]>({ queryKey: ["/api/wms/bins"] }).data;
  const stock = useQuery<BinRow[]>({ queryKey: ["/api/wms/bin-stock"] }).data;
  const [wh, setWh] = useState("RM");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: "", zone: "" });
  const add = useAction("POST", "/api/wms/bins", "Bin created");
  const [sel, setSel] = useState<number | null>(null);
  const [labels, setLabels] = useState(false);
  if (!bins || !stock) return <Skeleton className="h-64" />;
  const W = whs.find(w => w.code === wh);
  const list = bins.filter(b => b.whCode === wh);
  const zones = Array.from(new Set(list.map(b => b.zone)));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {whs.filter(w => w.code !== "WIP").map(w => <Button key={w.id} size="sm" variant={wh === w.code ? "default" : "outline"} onClick={() => setWh(w.code)} data-testid={`button-wh-${w.code}`}>{w.name}</Button>)}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setLabels(true)} disabled={!list.length} data-testid="button-bin-labels"><Tag className="h-4 w-4 mr-1" />Bin labels</Button>
        <Button size="sm" variant="outline" onClick={() => { setF({ code: "", zone: zones[0] ?? "" }); setOpen(true); }} data-testid="button-new-bin"><Plus className="h-4 w-4 mr-1" />New bin</Button>
      </div>
      {zones.map(z => (
        <div key={z}>
          <div className="text-xs font-medium text-muted-foreground mb-2">{z || "General"}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {list.filter(b => b.zone === z).map(b => {
              const rows = stock.filter(s => s.binId === b.id);
              const val = rows.reduce((a, r) => a + r.qty * r.cost, 0);
              return (
                <Card key={b.id} role="button" tabIndex={0} onClick={() => setSel(b.id)} onKeyDown={e => (e.key === "Enter" || e.key === " ") && setSel(b.id)} className={`cursor-pointer transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${rows.length ? "" : "border-dashed"}`} data-testid={`card-bin-${b.code}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between"><span className="font-mono text-sm font-semibold">{b.code}</span><span className="text-[11px] text-muted-foreground tabular-nums">{rows.length ? inr(val) : "Empty"}</span></div>
                    <div className="mt-2 space-y-1">{rows.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs"><span className="font-mono truncate">{r.itemCode}</span><span className="font-mono text-muted-foreground truncate">{r.batchNo ?? ""}</span><span className="ml-auto tabular-nums font-medium whitespace-nowrap">{qty(r.qty)} {r.uom}</span></div>))}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
      <BinDialog bin={bins.find(b => b.id === sel) ?? null} bins={bins} stock={stock} onClose={() => setSel(null)} />
      <LabelsDialog open={labels} onClose={() => setLabels(false)} title={`Bin labels — ${W?.name ?? ""}`} description="One label per bin, with a QR code for scanning at put-away, picking and cycle count." bins={list.map(b => ({ code: b.code, zone: b.zone, store: W?.code ?? "" }))} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New bin in {W?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Bin code</Label><Input value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder={`${wh}-D1-1`} className="font-mono" data-testid="input-bin-code" /></div>
            <div className="space-y-1"><Label>Zone</Label><Input value={f.zone} onChange={e => setF({ ...f, zone: e.target.value })} data-testid="input-bin-zone" /></div>
          </div>
          <DialogFooter><Button disabled={!f.code || !W} onClick={() => add.mutate({ code: f.code, zone: f.zone, warehouseId: W!.id }, { onSuccess: () => setOpen(false) })} data-testid="button-save-bin">Create bin</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PutawayRow({ r, bins, whName }: { r: Unbinned; bins: Bin[]; whName: string }) {
  const options = bins.filter(b => b.warehouse_id === r.warehouseId);
  const [bin, setBin] = useState(""); const [q, setQ] = useState(String(r.qty));
  useEffect(() => setQ(String(r.qty)), [r.qty]);
  const put = useAction("POST", "/api/wms/putaway", "Put away");
  return (
    <tr className="border-b" data-testid={`row-putaway-${r.itemCode}-${r.batchNo ?? "nb"}`}>
      <td className="px-4 py-2"><div className="font-mono text-xs">{r.itemCode}</div><div className="text-[11px] text-muted-foreground">{r.itemName}</div></td>
      <td className="px-3 text-xs">{whName}</td><td className="px-3 font-mono text-xs">{r.batchNo ?? "—"}</td>
      <td className="px-3 text-right tabular-nums">{qty(r.qty)} {r.uom}</td>
      <td className="px-3"><Select value={bin} onValueChange={setBin}><SelectTrigger className="h-8 w-36" data-testid={`select-bin-${r.itemCode}`}><SelectValue placeholder="Bin" /></SelectTrigger>
        <SelectContent>{options.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.code}</SelectItem>)}</SelectContent></Select></td>
      <td className="px-3"><Input className="h-8 w-24 text-right" value={q} onChange={e => setQ(e.target.value)} data-testid={`input-putaway-qty-${r.itemCode}`} /></td>
      <td className="px-4 text-right"><Button size="sm" disabled={!bin || !+q || put.isPending} onClick={() => put.mutate({ itemId: r.itemId, warehouseId: r.warehouseId, batchNo: r.batchNo, binId: +bin, qty: +q })} data-testid={`button-putaway-${r.itemCode}`}><PackagePlus className="h-3.5 w-3.5 mr-1" />Put away</Button></td>
    </tr>
  );
}
function PutawayTab() {
  const whs = lookup(useWarehouses().data);
  const bins = useQuery<Bin[]>({ queryKey: ["/api/wms/bins"] }).data ?? [];
  const { data } = useQuery<Unbinned[]>({ queryKey: ["/api/wms/unbinned"] });
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Stock not yet in a bin</CardTitle><p className="text-xs text-muted-foreground">New receipts, QC releases and production output land here until they are put away. Issues and dispatches reduce bin stock automatically.</p></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {!data ? <div className="p-4"><Skeleton className="h-24" /></div> : data.length === 0 ? <Empty>Everything is in a bin</Empty> : (
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-xs text-muted-foreground border-y bg-muted/40"><th className="text-left font-medium px-4 py-2">Item</th><th className="text-left font-medium px-3">Store</th><th className="text-left font-medium px-3">Batch</th><th className="text-right font-medium px-3">Qty</th><th className="text-left font-medium px-3">To bin</th><th className="text-left font-medium px-3">Qty</th><th /></tr></thead>
            <tbody>{data.map(r => <PutawayRow key={`${r.itemId}-${r.warehouseId}-${r.batchNo}`} r={r} bins={bins} whName={whs.get(r.warehouseId)?.name ?? ""} />)}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function PickTab() {
  const orders = (useOrders().data ?? []).filter(o => o.status === "PLANNED");
  const items = lookup(useItems().data);
  const sos = (useQuery<SoRow[]>({ queryKey: ["/api/sos"] }).data ?? []).filter(s => s.status !== "CLOSED");
  const [doc, setDoc] = useState("");
  const url = doc ? (doc.startsWith("o") ? `/api/wms/pick/order/${doc.slice(1)}` : `/api/wms/pick/so/${doc.slice(1)}`) : "";
  const pick = useQuery<Pick>({ queryKey: [url], enabled: !!url });
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-3 flex flex-wrap items-center gap-3 print:hidden">
        <Select value={doc} onValueChange={setDoc}><SelectTrigger className="w-96" data-testid="select-pick-doc"><SelectValue placeholder="Choose a planned production order or open sales order" /></SelectTrigger>
          <SelectContent>
            {orders.map(o => <SelectItem key={"o" + o.id} value={"o" + o.id}>Production {o.orderNo} — {items.get(o.itemId)?.code} × {o.qty}</SelectItem>)}
            {sos.map(s => <SelectItem key={"s" + s.id} value={"s" + s.id}>Dispatch {s.soNo} — {s.customerPo}</SelectItem>)}
          </SelectContent></Select>
        <Button variant="outline" disabled={!pick.data} onClick={() => window.print()} data-testid="button-print-pick"><Printer className="h-4 w-4 mr-1" />Print</Button>
        <span className="text-xs text-muted-foreground">Batches are picked first-in, first-out, the same order the system uses when it issues or dispatches.</span>
      </CardContent></Card>
      {!doc ? <Card><Empty>Choose a document to generate its pick list</Empty></Card> : !pick.data ? <Skeleton className="h-40" /> : (
        <Card data-testid="card-pick-list">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pick list {pick.data.ref}</CardTitle><p className="text-xs text-muted-foreground">{pick.data.title}</p></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-xs text-muted-foreground border-y bg-muted/40"><th className="text-left font-medium px-4 py-2">Item</th><th className="text-right font-medium px-3">Required</th><th className="text-left font-medium px-3">Bin</th><th className="text-left font-medium px-3">Batch</th><th className="text-right font-medium px-3">Pick</th><th className="text-left font-medium px-4">Picked ✓</th></tr></thead>
              <tbody>{pick.data.rows.map(r => [
                ...r.lines.map((l, i) => (
                  <tr key={r.itemCode + i} className="border-b">
                    {i === 0 ? <td className="px-4 py-1.5" rowSpan={r.lines.length + (r.short ? 1 : 0)}><div className="font-mono text-xs">{r.itemCode}</div><div className="text-[11px] text-muted-foreground">{r.itemName}</div></td> : null}
                    {i === 0 ? <td className="px-3 text-right tabular-nums" rowSpan={r.lines.length + (r.short ? 1 : 0)}>{qty(r.required)} {r.uom}</td> : null}
                    <td className={`px-3 font-mono text-xs ${l.bin === "Not put away" ? "text-[hsl(var(--chart-2))]" : ""}`}>{l.bin}</td><td className="px-3 font-mono text-xs">{l.batchNo ?? "—"}</td>
                    <td className="px-3 text-right tabular-nums font-medium">{qty(l.qty)}</td><td className="px-4"><span className="inline-block h-4 w-4 border rounded-sm" /></td>
                  </tr>)),
                r.short > 0 && <tr key={r.itemCode + "s"} className="border-b"><td colSpan={4} className="px-3 py-1.5 text-xs text-destructive">Short by {qty(r.short)} {r.uom}{r.lines.length === 0 ? "" : ""}</td></tr>,
                r.lines.length === 0 && !r.short ? null : null,
              ])}</tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CycleCountTab() {
  const { toast } = useToast();
  const bins = useQuery<Bin[]>({ queryKey: ["/api/wms/bins"] }).data ?? [];
  const stock = useQuery<BinRow[]>({ queryKey: ["/api/wms/bin-stock"] }).data ?? [];
  const history = useQuery<any[]>({ queryKey: ["/api/wms/cycle-counts"] }).data ?? [];
  const [bin, setBin] = useState(""); const [by, setBy] = useState(""); const [showSys, setShowSys] = useState(false);
  const rows = useMemo(() => stock.filter(s => String(s.binId) === bin), [stock, bin]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  useEffect(() => setCounts({}), [bin]);
  const k = (r: BinRow) => `${r.itemId}|${r.batchNo ?? ""}`;
  const submit = async () => {
    try {
      const res = await (await apiRequest("POST", "/api/wms/cycle-count", { binId: +bin, countedBy: by, lines: rows.map(r => ({ itemId: r.itemId, batchNo: r.batchNo, counted: +(counts[k(r)] ?? "") })) })).json();
      const v = res.lines.filter((l: any) => l.variance !== 0).length;
      toast({ title: `${res.ccNo} posted`, description: v ? `${v} variance line(s), value ${inr(res.varianceValue)} adjusted` : "No variance" });
      queryClient.invalidateQueries(); setCounts({});
    } catch (e) { toast({ title: "Count blocked", description: errMsg(e), variant: "destructive" }); }
  };
  const complete = rows.length > 0 && rows.every(r => counts[k(r)] !== undefined && counts[k(r)] !== "" && !isNaN(+counts[k(r)]));
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1"><Label>Bin</Label><Select value={bin} onValueChange={setBin}><SelectTrigger data-testid="select-cc-bin"><SelectValue placeholder="Choose bin" /></SelectTrigger>
              <SelectContent>{bins.filter(b => stock.some(s => s.binId === b.id)).map(b => <SelectItem key={b.id} value={String(b.id)}>{b.code}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Counted by</Label><Input value={by} onChange={e => setBy(e.target.value)} data-testid="input-cc-by" /></div>
            <label className="flex items-center gap-2 text-sm pb-2"><Switch checked={showSys} onCheckedChange={setShowSys} data-testid="switch-show-system" />Show system qty</label>
          </div>
          {!bin ? <Empty>Choose a bin. Counts are blind by default: the counter doesn't see the system quantity.</Empty> : (
            <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left font-medium py-2">Item</th><th className="text-left font-medium">Batch</th>{showSys && <th className="text-right font-medium">System</th>}<th className="text-right font-medium">Counted</th><th className="text-right font-medium">Variance</th></tr></thead>
              <tbody>{rows.map(r => { const c = counts[k(r)]; const v = c === undefined || c === "" ? null : +c - r.qty; return (
                <tr key={k(r)} className="border-b"><td className="py-1.5 font-mono text-xs">{r.itemCode}</td><td className="font-mono text-xs">{r.batchNo ?? "—"}</td>{showSys && <td className="text-right tabular-nums">{qty(r.qty)}</td>}
                  <td className="text-right"><Input className="h-8 w-24 ml-auto text-right" value={c ?? ""} onChange={e => setCounts(s => ({ ...s, [k(r)]: e.target.value }))} data-testid={`input-count-${r.itemCode}`} /></td>
                  <td className={`text-right tabular-nums ${v ? "text-destructive font-medium" : "text-muted-foreground"}`}>{v === null || !showSys ? (v === null ? "" : v === 0 ? "0" : "•") : (v > 0 ? "+" : "") + qty(+v.toFixed(3))}</td></tr>); })}</tbody></table>
          )}
          {bin && <Button disabled={!complete || !by.trim()} onClick={submit} data-testid="button-post-count"><ClipboardCheck className="h-4 w-4 mr-1" />Post count &amp; adjust stock</Button>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Count history</CardTitle></CardHeader>
        <CardContent className="p-0">{history.length === 0 ? <Empty>No counts yet</Empty> : history.map(h => (
          <div key={h.id} className="px-4 py-2 border-t text-xs"><div className="flex gap-2"><span className="font-mono">{h.cc_no}</span><span className="font-mono text-muted-foreground">{h.bin}</span><span className="ml-auto tabular-nums">{h.variance_value ? inr(h.variance_value) : "no variance"}</span></div>
            <div className="text-muted-foreground">{h.date} · {h.counted_by} · {h.lines.length} line(s)</div></div>))}</CardContent>
      </Card>
    </div>
  );
}

export default function WarehousePage() {
  return (
    <>
      <PageIntro>Rack, shelf and bin locations for stores and finished goods. Put away receipts, print first-in, first-out pick lists for production and dispatch, and run blind cycle counts.</PageIntro>
      <Tabs defaultValue="bins">
        <TabsList className="print:hidden"><TabsTrigger value="bins" data-testid="tab-bins">Bins</TabsTrigger><TabsTrigger value="putaway" data-testid="tab-putaway">Put-away</TabsTrigger><TabsTrigger value="pick" data-testid="tab-pick">Pick lists</TabsTrigger><TabsTrigger value="count" data-testid="tab-count">Cycle count</TabsTrigger></TabsList>
        <TabsContent value="bins"><BinsTab /></TabsContent>
        <TabsContent value="putaway"><PutawayTab /></TabsContent>
        <TabsContent value="pick"><PickTab /></TabsContent>
        <TabsContent value="count"><CycleCountTab /></TabsContent>
      </Tabs>
    </>
  );
}
