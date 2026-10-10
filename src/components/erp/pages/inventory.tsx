"use client";
import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApi, useAction, lookup, inr, qty } from "@/lib/erp/client";
import type { ItemRow, Warehouse, StockRow, StockTxn } from "@/lib/erp/shared";
import { PageIntro, Empty } from "../shared";
import { ExportButton } from "../export-button";

const INV_CSV_COLUMNS = [
  { key: "itemCode", header: "Item code" },
  { key: "itemName", header: "Item name" },
  { key: "warehouseCode", header: "Warehouse code" },
  { key: "warehouseName", header: "Warehouse name" },
  { key: "batchNo", header: "Batch no" },
  { key: "qty", header: "Quantity" },
  { key: "uom", header: "UOM" },
  { key: "value", header: "Stock value (INR)" },
] as const;

export default function InventoryPage() {
  const { data: stock, isLoading } = useApi<(StockRow & { warehouseCode: string; warehouseName: string })[]>("/api/inventory");
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const { data: whs } = useApi<Warehouse[]>("/api/warehouses");
  const { data: txns } = useApi<StockTxn[]>("/api/txns");
  const itemMap = lookup(items);
  const whMap = lookup(whs);
  const [wh, setWh] = useState("all");
  const [open, setOpen] = useState(false);

  const rows = (stock ?? []).filter((s) => wh === "all" || s.warehouseCode === wh);
  const value = rows.reduce((sum, r) => sum + r.qty * (itemMap.get(r.itemId)?.stdCost ?? 0), 0);

  const csvRows = rows.map((r) => {
    const it = itemMap.get(r.itemId);
    return {
      itemCode: it?.code ?? "",
      itemName: it?.name ?? "",
      warehouseCode: r.warehouseCode,
      warehouseName: r.warehouseName,
      batchNo: r.batchNo ?? "",
      qty: r.qty,
      uom: it?.uom ?? "",
      value: r.qty * (it?.stdCost ?? 0),
    };
  });

  return (
    <>
      <PageIntro actions={
        <div className="flex items-center gap-2">
          <ExportButton filename="tau-inventory" rows={csvRows} columns={[...INV_CSV_COLUMNS]} />
          <Button onClick={() => setOpen(true)}><ArrowRightLeft className="h-4 w-4 mr-1" />Transfer / QC release</Button>
        </div>
      }>
        Batch-wise stock by warehouse (QC quarantine and rejected stock excluded from available totals). FIFO issues deplete oldest batches first.
      </PageIntro>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Stock value (visible)</div><div className="text-2xl font-semibold tabular-nums mt-1">{inr(value)}</div></div>
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Stock lines</div><div className="text-2xl font-semibold tabular-nums mt-1">{rows.length}</div></div>
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Warehouses</div><div className="text-2xl font-semibold tabular-nums mt-1">{whs?.length ?? 0}</div></div>
      </div>
      <div className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap gap-2 p-3 border-b">
          <Select value={wh} onValueChange={setWh}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All warehouses</SelectItem>{whs?.map((w) => <SelectItem key={w.id} value={w.code}>{w.code} — {w.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="overflow-x-auto scroll-thin">
          {isLoading ? <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div> : rows.length === 0 ? <Empty>No stock</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b">
                {["Item", "Warehouse", "Batch", "Qty", "Value"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i === 3 || i === 4 ? "text-right" : "text-left"}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const it = itemMap.get(r.itemId);
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-2"><span className="font-mono text-xs">{it?.code}</span><span className="text-xs text-muted-foreground block">{it?.name}</span></td>
                      <td className="px-5 text-xs"><span className="font-mono">{r.warehouseCode}</span> <span className="text-muted-foreground">{r.warehouseName}</span></td>
                      <td className="px-5 font-mono text-xs">{r.batchNo ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-5 text-right tabular-nums">{qty(r.qty)} <span className="text-muted-foreground text-xs">{it?.uom}</span></td>
                      <td className="px-5 text-right tabular-nums">{inr(r.qty * (it?.stdCost ?? 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-xs mt-4">
        <div className="px-5 pt-4 pb-2"><h2 className="text-sm font-semibold">Stock ledger (recent movements)</h2></div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card"><tr className="text-xs text-muted-foreground border-b">
              {["Date", "Item", "Wh", "Qty", "Type", "Ref", "Batch"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(txns ?? []).slice(0, 80).map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-1.5 font-mono text-xs">{t.date}</td>
                  <td className="px-5 text-xs font-mono">{itemMap.get(t.itemId)?.code ?? t.itemId}</td>
                  <td className="px-5 text-xs font-mono">{whMap.get(t.warehouseId)?.code}</td>
                  <td className={`px-5 text-right tabular-nums ${t.qty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{t.qty > 0 ? "+" : ""}{qty(t.qty)}</td>
                  <td className="px-5 text-xs">{t.txnType}</td>
                  <td className="px-5 text-xs text-muted-foreground">{t.ref ?? "—"}</td>
                  <td className="px-5 font-mono text-xs text-muted-foreground">{t.batchNo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <TransferDialog open={open} onOpenChange={setOpen} items={items ?? []} whs={whs ?? []} />
    </>
  );
}

function TransferDialog({ open, onOpenChange, items, whs }: { open: boolean; onOpenChange: (o: boolean) => void; items: ItemRow[]; whs: Warehouse[] }) {
  const [itemId, setItemId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [qtyVal, setQty] = useState("");
  const transfer = useAction("POST", "/api/inventory/transfer", "Stock transferred");
  const submit = () => transfer.mutate({ itemId: Number(itemId), batchNo: batchNo || null, fromWh: Number(fromWh), toWh: Number(toWh), qty: Number(qtyVal), ref: "MANUAL" } as never, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transfer stock / QC release</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs font-medium">Item</label>
            <Select value={itemId} onValueChange={setItemId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent className="max-h-72">{items.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><label className="text-xs font-medium">Batch no. (optional)</label><Input className="mt-1" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="leave blank if no batch" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">From warehouse</label>
              <Select value={fromWh} onValueChange={setFromWh}><SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{whs.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.code} — {w.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><label className="text-xs font-medium">To warehouse</label>
              <Select value={toWh} onValueChange={setToWh}><SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{whs.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.code} — {w.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div><label className="text-xs font-medium">Quantity</label><Input type="number" step="0.001" className="mt-1" value={qtyVal} onChange={(e) => setQty(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={!itemId || !fromWh || !toWh || !qtyVal || transfer.isPending}>Transfer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
