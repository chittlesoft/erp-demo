import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Play, CheckCircle2, ChevronDown, Send, Cpu } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useItems, useWarehouses, useOrders, useAction, lookup, qty, type ProductionOrder, type Requirement, type ItemRow } from "@/lib/erp";
import { PageIntro, StatusBadge, Empty } from "@/components/layout";
import { SerialLabelsButton } from "@/pages/shopfloor";

export function NewOrderDialog({ open, onOpenChange, presetItemId, presetQty }: { open: boolean; onOpenChange: (o: boolean) => void; presetItemId?: number; presetQty?: number }) {
  const items = (useItems().data ?? []).filter(i => i.hasBom);
  const whs = useWarehouses().data ?? [];
  const def = () => ({ itemId: presetItemId ? String(presetItemId) : "", qty: presetQty ? String(Math.ceil(presetQty)) : "", dueDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), warehouseId: "" });
  const [f, setF] = useState(def);
  useEffect(() => { if (open) setF(def()); }, [open, presetItemId, presetQty]);
  const save = useAction("POST", "/api/orders", "Production order planned");
  const item = items.find(i => String(i.id) === f.itemId);
  const wh = f.warehouseId || String(whs.find(w => w.code === (item?.type === "SFG" ? "WIP" : "FG"))?.id ?? "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Plan production order</DialogTitle><DialogDescription>Materials are reserved when the order is started on the shop floor.</DialogDescription></DialogHeader>
        <form className="grid grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); save.mutate({ itemId: +f.itemId, qty: +f.qty, dueDate: f.dueDate, warehouseId: +wh }, { onSuccess: () => onOpenChange(false) }); }}>
          <div className="col-span-2 space-y-1"><Label>Product</Label>
            <Select value={f.itemId} onValueChange={v => setF({ ...f, itemId: v, warehouseId: "" })}><SelectTrigger data-testid="select-order-item"><SelectValue placeholder="Choose sensor or sub-assembly" /></SelectTrigger>
              <SelectContent>{items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Quantity</Label><Input type="number" min="1" step="1" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} data-testid="input-order-qty" /></div>
          <div className="space-y-1"><Label>Due date</Label><Input type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} data-testid="input-order-due" /></div>
          <div className="col-span-2 space-y-1"><Label>Output location</Label>
            <Select value={wh} onValueChange={v => setF({ ...f, warehouseId: v })}><SelectTrigger data-testid="select-order-wh"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{whs.filter(w => w.code !== "QC").map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent></Select></div>
          <DialogFooter className="col-span-2"><Button type="submit" disabled={!f.itemId || !f.qty || !wh || save.isPending} data-testid="button-save-order">Plan order</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ order, item, onClose }: { order: ProductionOrder | null; item?: ItemRow; onClose: () => void }) {
  const [good, setGood] = useState("");
  const done = useAction("POST", `/api/orders/${order?.id}/complete`, "Order completed — output posted to stock");
  if (!order) return null;
  const g = good === "" ? order.qty : +good;
  const rej = Math.max(0, order.qty - g);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Complete {order.orderNo}</DialogTitle>
          <DialogDescription>{item?.tracking === "serial" ? "A serial number is generated for every unit, with its end-of-line (EOL) test result." : "Output is posted to stock with the order number as batch."}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Passed EOL test</Label><Input type="number" min="0" max={order.qty} value={good === "" ? String(order.qty) : good} onChange={e => setGood(e.target.value)} data-testid="input-good-qty" /></div>
          <div className="space-y-1"><Label>Rejected</Label><Input value={String(rej)} disabled data-testid="input-reject-qty" /></div>
        </div>
        <DialogFooter><Button disabled={done.isPending || g < 0 || g > order.qty} onClick={() => done.mutate({ goodQty: g, rejectQty: rej }, { onSuccess: onClose })} data-testid="button-confirm-complete">Post output</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetail({ order, items }: { order: ProductionOrder; items: Map<number, ItemRow> }) {
  const reqs = useQuery<Requirement[]>({ queryKey: ["/api/orders", order.id, "requirements"], enabled: order.status === "PLANNED" });
  const consumed = JSON.parse(order.consumedBatches) as { itemId: number; batchNo: string | null; qty: number }[];
  if (order.status === "PLANNED") return (
    <div className="px-6 py-3 bg-muted/30">
      <div className="text-xs font-medium text-muted-foreground mb-2">Material requirement (single level)</div>
      {!reqs.data ? <Skeleton className="h-16" /> : (
        <table className="w-full text-xs"><tbody>{reqs.data.map(r => (
          <tr key={r.itemId}><td className="py-1 font-mono">{r.code}</td><td className="text-muted-foreground">{r.name}</td>
            <td className="text-right tabular-nums">{qty(r.required)} {r.uom}</td><td className="text-right tabular-nums text-muted-foreground">avail {qty(r.available)}</td>
            <td className={`text-right tabular-nums font-medium ${r.shortage ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{r.shortage ? `short ${qty(r.shortage)}` : "OK"}</td></tr>))}</tbody></table>
      )}
    </div>
  );
  return (
    <div className="px-6 py-3 bg-muted/30">
      <div className="text-xs font-medium text-muted-foreground mb-2">Batches consumed (FIFO)</div>
      <div className="flex flex-wrap gap-1.5">{consumed.map((c, i) => (
        <span key={i} className="rounded border bg-background px-2 py-0.5 text-[11px]"><span className="font-mono">{items.get(c.itemId)?.code}</span> · <span className="font-mono">{c.batchNo ?? "no batch"}</span> · {qty(c.qty)}</span>))}</div>
    </div>
  );
}

export default function ProductionPage() {
  const { data, isLoading } = useOrders();
  const items = lookup(useItems().data);
  const [status, setStatus] = useState("open");
  const [newOpen, setNewOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [completing, setCompleting] = useState<ProductionOrder | null>(null);
  const start = useAction<number>("POST", id => `/api/orders/${id}/start`, "Order started — materials issued");
  const release = useAction<number>("POST", id => `/api/mes/release/${id}`, "Released to shop floor — serial numbers generated");
  const rows = (data ?? []).filter(o => status === "all" || (status === "open" ? o.status !== "COMPLETED" : o.status === status));
  return (
    <>
      <PageIntro actions={<Button onClick={() => setNewOpen(true)} data-testid="button-new-order"><Plus className="h-4 w-4 mr-1" />New order</Button>}>
        Plan → Start (checks shortages, issues batches FIFO) → Release to shop floor (serials generated, tracked station by station) → Close on Shop Floor. Sub-assemblies without a routing are completed here.
      </PageIntro>
      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b">
          {[["open", "Open"], ["PLANNED", "Planned"], ["IN_PROGRESS", "In progress"], ["COMPLETED", "Completed"], ["all", "All"]].map(([v, l]) => (
            <Button key={v} size="sm" variant={status === v ? "default" : "outline"} onClick={() => setStatus(v)} data-testid={`button-filter-${v}`}>{l}</Button>))}
        </div>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : rows.length === 0 ? <Empty>No orders in this view</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="w-8" /><th className="text-left font-medium px-3 py-2">Order</th><th className="text-left font-medium px-3">Product</th><th className="text-right font-medium px-3">Qty</th><th className="text-right font-medium px-3">Good / Rej</th><th className="text-left font-medium px-3">Due</th><th className="text-left font-medium px-3">Status</th><th className="px-3" /></tr></thead>
              <tbody>{rows.map(o => { const it = items.get(o.itemId); return [
                <tr key={o.id} className="border-b hover:bg-muted/30" data-testid={`row-order-${o.id}`}>
                  <td className="pl-3"><button onClick={() => setExpanded(expanded === o.id ? null : o.id)} aria-label="Details" data-testid={`button-expand-order-${o.id}`}><ChevronDown className={`h-4 w-4 transition-transform ${expanded === o.id ? "" : "-rotate-90"}`} /></button></td>
                  <td className="px-3 py-2 font-mono text-xs">{o.orderNo}</td>
                  <td className="px-3"><div>{it?.name}</div><div className="text-[11px] text-muted-foreground font-mono">{it?.code}</div></td>
                  <td className="px-3 text-right tabular-nums">{qty(o.qty)}</td>
                  <td className="px-3 text-right tabular-nums text-xs">{o.status === "COMPLETED" ? <>{qty(o.goodQty)} / <span className="text-destructive">{qty(o.rejectQty)}</span></> : "—"}</td>
                  <td className="px-3 tabular-nums text-xs">{o.dueDate}</td>
                  <td className="px-3"><StatusBadge status={o.status} /></td>
                  <td className="px-3 text-right whitespace-nowrap">
                    {o.status === "PLANNED" && <Button size="sm" variant="outline" disabled={start.isPending} onClick={() => start.mutate(o.id)} data-testid={`button-start-${o.id}`}><Play className="h-3.5 w-3.5 mr-1" />Start</Button>}
                    {(o as any).released && <SerialLabelsButton orderId={o.id} />}
                    {o.status === "IN_PROGRESS" && (o as any).released && <Link href="/shopfloor" className="inline-flex items-center text-xs font-medium text-primary hover:underline" data-testid={`link-shopfloor-${o.id}`}><Cpu className="h-3.5 w-3.5 mr-1" />On shop floor</Link>}
                    {o.status === "IN_PROGRESS" && !(o as any).released && (o as any).hasRouting && <Button size="sm" disabled={release.isPending} onClick={() => release.mutate(o.id)} data-testid={`button-release-${o.id}`}><Send className="h-3.5 w-3.5 mr-1" />Release to floor</Button>}
                    {o.status === "IN_PROGRESS" && !(o as any).released && !(o as any).hasRouting && <Button size="sm" onClick={() => setCompleting(o)} data-testid={`button-complete-${o.id}`}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Complete</Button>}
                  </td>
                </tr>,
                expanded === o.id && <tr key={o.id + "-d"} className="border-b"><td colSpan={8} className="p-0"><OrderDetail order={o} items={items} /></td></tr>,
              ]; })}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} />
      <CompleteDialog order={completing} item={completing ? items.get(completing.itemId) : undefined} onClose={() => setCompleting(null)} />
    </>
  );
}
