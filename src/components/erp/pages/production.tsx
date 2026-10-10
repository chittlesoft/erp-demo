"use client";
import { useState } from "react";
import { Plus, Play, CheckCircle2, Cpu, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApi, useAction, lookup, qty } from "@/lib/erp/client";
import type { ItemRow, Warehouse, ProductionOrder, Requirement } from "@/lib/erp/shared";
import { PageIntro, Empty, StatusBadge } from "../shared";
import { useNav } from "@/lib/erp/nav";

export default function ProductionPage() {
  const { data: orders, isLoading } = useApi<ProductionOrder[]>("/api/orders");
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const { data: whs } = useApi<Warehouse[]>("/api/warehouses");
  const itemMap = lookup(items);
  const fgWh = whs?.find((w) => w.code === "FG");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ProductionOrder | null>(null);
  const start = useAction("POST", (id: number) => `/api/orders/${id}/start`, "Order started — material issued FIFO");
  const complete = useAction("POST", (d: { id: number; goodQty: number; rejectQty: number }) => `/api/orders/${d.id}/complete`, "Order completed");
  const release = useAction("POST", (id: number) => `/api/orders/${id}/release`, "Released to shop floor");
  const { go } = useNav();

  return (
    <>
      <PageIntro actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />New order</Button>}>
        Plan production against a BOM, issue material FIFO, release to the shop floor, and complete with serial generation.
      </PageIntro>
      <div className="rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto scroll-thin">
          {isLoading ? <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div> : (orders ?? []).length === 0 ? <Empty>No orders</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b">
                {["Order", "Product", "Qty", "Good", "Rej", "Due", "Status", ""].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${(i >= 2 && i <= 5) ? "text-right" : "text-left"}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(orders ?? []).map((o) => {
                  const it = itemMap.get(o.itemId);
                  const canRelease = it?.tracking === "serial" && o.status === "PLANNED";
                  return (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-2 font-mono text-xs">{o.orderNo}</td>
                      <td className="px-5"><span className="font-mono text-xs">{it?.code}</span><span className="text-xs text-muted-foreground block">{it?.name}</span></td>
                      <td className="px-5 text-right tabular-nums">{qty(o.qty)}</td>
                      <td className="px-5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{qty(o.goodQty)}</td>
                      <td className="px-5 text-right tabular-nums text-destructive">{qty(o.rejectQty)}</td>
                      <td className="px-5 text-right tabular-nums text-muted-foreground">{o.dueDate}</td>
                      <td className="px-5"><StatusBadge status={o.status} /></td>
                      <td className="px-5 py-2 text-right whitespace-nowrap">
                        {o.status === "PLANNED" && it?.tracking === "serial" && <Button size="sm" variant="outline" onClick={() => release.mutate(o.id)} disabled={release.isPending}><Cpu className="h-3.5 w-3.5 mr-1" />Release to floor</Button>}
                        {o.status === "PLANNED" && it?.tracking !== "serial" && <Button size="sm" variant="outline" onClick={() => start.mutate(o.id)} disabled={start.isPending}><Play className="h-3.5 w-3.5 mr-1" />Start</Button>}
                        {o.status === "IN_PROGRESS" && it?.tracking !== "serial" && <Button size="sm" variant="outline" onClick={() => setView(o)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Complete</Button>}
                        {o.status === "IN_PROGRESS" && it?.tracking === "serial" && <Button size="sm" variant="outline" onClick={() => go("shopfloor")}>Shop floor →</Button>}
                        <Button size="icon" variant="ghost" onClick={() => setView(o)} aria-label="Details"><FileText className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <OrderDialog open={open} onOpenChange={setOpen} items={items ?? []} fgWhId={fgWh?.id} />
      {view && <DetailDialog order={view} onClose={() => setView(null)} onComplete={(g, r) => complete.mutate({ id: view.id, goodQty: g, rejectQty: r }, { onSuccess: () => setView(null) })} />}
    </>
  );
}

function OrderDialog({ open, onOpenChange, items, fgWhId }: { open: boolean; onOpenChange: (o: boolean) => void; items: ItemRow[]; fgWhId?: number }) {
  const [itemId, setItemId] = useState("");
  const [qtyVal, setQty] = useState("");
  const [due, setDue] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const create = useAction("POST", "/api/orders", "Order planned");
  const fgs = items.filter((i) => i.type === "FG" || i.type === "SFG");
  const submit = () => create.mutate({ itemId: Number(itemId), qty: Number(qtyVal), dueDate: due, warehouseId: fgWhId ?? 0 } as never, { onSuccess: () => { onOpenChange(false); setItemId(""); setQty(""); } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New production order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs font-medium">Product</label>
            <Select value={itemId} onValueChange={setItemId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select FG / SFG" /></SelectTrigger>
              <SelectContent className="max-h-72">{fgs.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent></Select>
            {itemId && !items.find((i) => i.id === Number(itemId))?.hasBom && <p className="text-xs text-destructive mt-1">This item has no BOM — define one first.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Quantity</label><Input type="number" className="mt-1" value={qtyVal} onChange={(e) => setQty(e.target.value)} /></div>
            <div><label className="text-xs font-medium">Due date</label><Input type="date" className="mt-1" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={!itemId || !qtyVal || create.isPending}>Plan order</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ order, onClose, onComplete }: { order: ProductionOrder; onClose: () => void; onComplete: (g: number, r: number) => void }) {
  const { data: reqs } = useApi<Requirement[]>(`/api/orders/${order.id}/requirements`);
  const [good, setGood] = useState(String(order.qty));
  const [rej, setRej] = useState("0");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="font-mono">{order.orderNo}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Quantity</div><div className="font-medium tabular-nums">{qty(order.qty)}</div></div>
            <div><div className="text-xs text-muted-foreground">Good</div><div className="font-medium tabular-nums text-emerald-600">{qty(order.goodQty)}</div></div>
            <div><div className="text-xs text-muted-foreground">Rejected</div><div className="font-medium tabular-nums text-destructive">{qty(order.rejectQty)}</div></div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">BOM requirements (net of available stock)</h3>
            <table className="w-full text-sm border rounded-md">
              <thead><tr className="text-xs text-muted-foreground border-b">{["Component", "Required", "Available", "Shortage"].map((h, i) => <th key={i} className={`font-medium px-3 py-1.5 ${i >= 1 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {(reqs ?? []).map((r) => (
                  <tr key={r.itemId} className="border-b last:border-0">
                    <td className="px-3 py-1.5"><span className="font-mono text-xs">{r.code}</span><span className="text-xs text-muted-foreground block">{r.name}</span></td>
                    <td className="px-3 text-right tabular-nums">{qty(r.required)} {r.uom}</td>
                    <td className="px-3 text-right tabular-nums">{qty(r.available)}</td>
                    <td className={`px-3 text-right tabular-nums ${r.shortage > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{qty(r.shortage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {order.status === "IN_PROGRESS" && (
            <div className="border-t pt-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Complete order</h3>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div><label className="text-xs font-medium">Good qty</label><Input type="number" value={good} onChange={(e) => setGood(e.target.value)} /></div>
                <div><label className="text-xs font-medium">Rejected qty</label><Input type="number" value={rej} onChange={(e) => setRej(e.target.value)} /></div>
                <Button onClick={() => onComplete(Number(good), Number(rej))}>Complete</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Good + rejected must equal {qty(order.qty)}. Good units get PASS serials; rejected get FAIL serials.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
