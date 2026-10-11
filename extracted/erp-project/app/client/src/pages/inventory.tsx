import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, ArrowRightLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useItems, useWarehouses, useAction, lookup, qty, inr, type StockRow, type StockTxn } from "@/lib/erp";
import { PageIntro, Empty } from "@/components/layout";

const TXN_LABEL: Record<string, string> = { RECEIPT: "Receipt", ISSUE: "Issue to production", PROD_OUT: "Production output", TRANSFER: "Transfer", DISPATCH: "Dispatch (invoice)", ADJUST: "Adjustment" };

function ReceiveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const items = useItems().data ?? [];
  const whs = useWarehouses().data ?? [];
  const [f, setF] = useState({ itemId: "", warehouseId: "", qty: "", batchNo: "", ref: "" });
  const item = items.find(i => String(i.id) === f.itemId);
  const save = useAction("POST", "/api/receipts", "Material received");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Receive material (GRN)</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate({ itemId: +f.itemId, warehouseId: +f.warehouseId, qty: +f.qty, batchNo: f.batchNo || null, ref: f.ref }, { onSuccess: () => { onOpenChange(false); setF({ itemId: "", warehouseId: "", qty: "", batchNo: "", ref: "" }); } }); }}>
          <div className="space-y-1"><Label>Item</Label>
            <Select value={f.itemId} onValueChange={v => setF({ ...f, itemId: v })}><SelectTrigger data-testid="select-receive-item"><SelectValue placeholder="Choose item" /></SelectTrigger>
              <SelectContent>{items.filter(i => i.type === "RM" || i.type === "CONSUMABLE").map(i => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Location</Label>
              <Select value={f.warehouseId} onValueChange={v => setF({ ...f, warehouseId: v })}><SelectTrigger data-testid="select-receive-wh"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{whs.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Quantity {item && `(${item.uom})`}</Label><Input type="number" step="any" min="0" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} data-testid="input-receive-qty" /></div>
            <div className="space-y-1"><Label>Batch / lot no. {item?.tracking === "batch" && <span className="text-destructive">*</span>}</Label><Input value={f.batchNo} onChange={e => setF({ ...f, batchNo: e.target.value.toUpperCase() })} data-testid="input-receive-batch" /></div>
            <div className="space-y-1"><Label>GRN / reference</Label><Input value={f.ref} onChange={e => setF({ ...f, ref: e.target.value.toUpperCase() })} placeholder="GRN-2610-…" data-testid="input-receive-ref" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Tip: receive into QC Quarantine when incoming inspection is required; stock there is excluded from MRP until released.</p>
          <DialogFooter><Button type="submit" disabled={!f.itemId || !f.warehouseId || !f.qty || !f.ref || save.isPending} data-testid="button-save-receipt">Post receipt</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ row, onClose }: { row: StockRow | null; onClose: () => void }) {
  const whs = useWarehouses().data ?? [];
  const items = lookup(useItems().data);
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const save = useAction("POST", "/api/transfers", "Stock transferred");
  if (!row) return null;
  const it = items.get(row.itemId);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transfer stock</DialogTitle></DialogHeader>
        <div className="text-sm"><span className="font-mono text-xs">{it?.code}</span> · batch <span className="font-mono text-xs">{row.batchNo ?? "—"}</span> · available {qty(row.qty)} {it?.uom}</div>
        <form className="grid grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); save.mutate({ itemId: row.itemId, batchNo: row.batchNo, fromWh: row.warehouseId, toWh: +to, qty: +q }, { onSuccess: onClose }); }}>
          <div className="space-y-1"><Label>To location</Label>
            <Select value={to} onValueChange={setTo}><SelectTrigger data-testid="select-transfer-to"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{whs.filter(w => w.id !== row.warehouseId).map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Quantity</Label><Input type="number" step="any" min="0" max={row.qty} value={q} onChange={e => setQ(e.target.value)} data-testid="input-transfer-qty" /></div>
          <DialogFooter className="col-span-2"><Button type="submit" disabled={!to || !q || save.isPending} data-testid="button-save-transfer">Transfer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const items = lookup(useItems().data);
  const whs = useWarehouses().data ?? [];
  const W = lookup(whs);
  const stock = useQuery<StockRow[]>({ queryKey: ["/api/stock"] });
  const txns = useQuery<StockTxn[]>({ queryKey: ["/api/txns"] });
  const [wh, setWh] = useState("all");
  const [recv, setRecv] = useState(false);
  const [trf, setTrf] = useState<StockRow | null>(null);
  const rows = useMemo(() => (stock.data ?? []).filter(r => wh === "all" || String(r.warehouseId) === wh), [stock.data, wh]);
  return (
    <>
      <PageIntro actions={<Button onClick={() => setRecv(true)} data-testid="button-receive"><PackagePlus className="h-4 w-4 mr-1" />Receive material</Button>}>
        Batch-wise stock across stores, WIP, finished goods and QC quarantine. Production issues consume batches first-in, first-out.
      </PageIntro>
      <Tabs defaultValue="stock">
        <TabsList><TabsTrigger value="stock" data-testid="tab-stock">Stock by batch</TabsTrigger><TabsTrigger value="ledger" data-testid="tab-ledger">Stock ledger</TabsTrigger></TabsList>
        <TabsContent value="stock">
          <Card>
            <div className="flex flex-wrap gap-2 p-3 border-b">
              {[{ id: "all", name: "All locations" }, ...whs.map(w => ({ id: String(w.id), name: w.name }))].map(w => (
                <Button key={w.id} size="sm" variant={wh === w.id ? "default" : "outline"} onClick={() => setWh(w.id)} data-testid={`button-filter-wh-${w.id}`}>{w.name}</Button>
              ))}
            </div>
            <CardContent className="p-0 overflow-x-auto">
              {stock.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : rows.length === 0 ? <Empty>No stock in this location</Empty> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Item</th><th className="text-left font-medium px-3">Batch / lot</th><th className="text-left font-medium px-3">Location</th><th className="text-right font-medium px-3">Qty</th><th className="text-right font-medium px-3">Value</th><th className="px-3" /></tr></thead>
                  <tbody>{rows.map((r, i) => { const it = items.get(r.itemId); return (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-stock-${i}`}>
                      <td className="px-4 py-2"><span className="font-mono text-xs">{it?.code}</span><div className="text-xs text-muted-foreground">{it?.name}</div></td>
                      <td className="px-3 font-mono text-xs">{r.batchNo ?? "—"}</td>
                      <td className="px-3 text-xs">{W.get(r.warehouseId)?.code === "QC" ? <span className="text-[hsl(var(--chart-2))] font-medium">QC Quarantine</span> : W.get(r.warehouseId)?.name}</td>
                      <td className="px-3 text-right tabular-nums">{qty(r.qty)} <span className="text-xs text-muted-foreground">{it?.uom}</span></td>
                      <td className="px-3 text-right tabular-nums">{inr(r.qty * (it ? (it.hasBom ? it.rolledCost : it.stdCost) : 0))}</td>
                      <td className="px-3 text-right"><Button size="sm" variant="ghost" onClick={() => setTrf(r)} data-testid={`button-transfer-${i}`}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />{W.get(r.warehouseId)?.code === "QC" ? "Release" : "Move"}</Button></td>
                    </tr>); })}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ledger">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Date</th><th className="text-left font-medium px-3">Type</th><th className="text-left font-medium px-3">Reference</th><th className="text-left font-medium px-3">Item</th><th className="text-left font-medium px-3">Batch</th><th className="text-left font-medium px-3">Location</th><th className="text-right font-medium px-4">Qty</th></tr></thead>
              <tbody>{(txns.data ?? []).map(t => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-4 py-1.5 tabular-nums text-xs">{t.date}</td><td className="px-3 text-xs">{TXN_LABEL[t.txnType] ?? t.txnType}</td>
                  <td className="px-3 font-mono text-xs">{t.ref}</td><td className="px-3 font-mono text-xs">{items.get(t.itemId)?.code}</td>
                  <td className="px-3 font-mono text-xs">{t.batchNo ?? "—"}</td><td className="px-3 text-xs">{W.get(t.warehouseId)?.code}</td>
                  <td className={`px-4 text-right tabular-nums ${t.qty < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{t.qty > 0 ? "+" : ""}{qty(t.qty)}</td>
                </tr>))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      <ReceiveDialog open={recv} onOpenChange={setRecv} />
      <TransferDialog row={trf} onClose={() => setTrf(null)} />
    </>
  );
}
