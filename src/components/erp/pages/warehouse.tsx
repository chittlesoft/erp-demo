"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { PackagePlus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, useAction, lookup, inr2, qty } from "@/lib/erp/client";
import type { ItemRow, Bin, StockRow } from "@/lib/erp/shared";
import { asRole, canEdit } from "@/lib/erp/auth-shared";
import { PageIntro, Empty } from "../shared";

export default function WarehousePage() {
  const { data: session } = useSession();
  const canMutate = canEdit(asRole(session?.user?.role));
  const { data: bins } = useApi<(Bin & { item: ItemRow })[]>("/api/phase3/bins");
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const { data: stock } = useApi<(StockRow & { warehouseCode: string })[]>("/api/inventory");
  const itemMap = lookup(items);
  const [open, setOpen] = useState(false);

  // unbinned stock (RM warehouse, positive, not yet in a bin)
  const binKeys = new Set((bins ?? []).map((b) => `${b.itemId}|${b.batchNo ?? ""}`));
  const unbinned = (stock ?? []).filter((s) => s.qty > 0.0001 && !binKeys.has(`${s.itemId}|${s.batchNo ?? ""}`));

  return (
    <>
      <PageIntro actions={canMutate ? <Button onClick={() => setOpen(true)}><PackagePlus className="h-4 w-4 mr-1" />Put away</Button> : undefined}>
        WMS-lite — bin/rack locations per store. Unbinned stock from GRN is shown for put-away; FIFO picks deplete bins automatically on issue/dispatch.
      </PageIntro>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Bins in use</div><div className="text-2xl font-semibold tabular-nums mt-1">{bins?.length ?? 0}</div></div>
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Unbinned stock lines</div><div className="text-2xl font-semibold tabular-nums mt-1 text-amber-600">{unbinned.length}</div></div>
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Binned value</div><div className="text-2xl font-semibold tabular-nums mt-1">{inr2(bins?.reduce((s, b) => s + b.qty * b.item.stdCost, 0) ?? 0)}</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card shadow-xs">
          <div className="px-5 pt-4 pb-2 flex items-center gap-2"><LayoutGrid className="h-4 w-4" /><h2 className="text-sm font-semibold">Bin map</h2></div>
          <div className="overflow-x-auto scroll-thin max-h-96 overflow-y-auto">
            {bins?.length === 0 ? <Empty>No bins — put away unbinned stock</Empty> : (
              <table className="zebra w-full text-sm">
                <thead className="sticky top-0 bg-card"><tr className="text-xs text-muted-foreground border-b">{["Bin", "Item", "Batch", "Qty", "Value"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${(i === 3 || i === 4) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {bins?.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="px-5 py-2 font-mono text-xs">{b.code}</td>
                      <td className="px-5"><span className="font-mono text-xs">{b.item.code}</span><span className="text-xs text-muted-foreground block">{b.item.name}</span></td>
                      <td className="px-5 font-mono text-xs">{b.batchNo ?? "—"}</td>
                      <td className="px-5 text-right tabular-nums">{qty(b.qty)} {b.item.uom}</td>
                      <td className="px-5 text-right tabular-nums">{inr2(b.qty * b.item.stdCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-card shadow-xs">
          <div className="px-5 pt-4 pb-2"><h2 className="text-sm font-semibold">Awaiting put-away</h2></div>
          <div className="overflow-x-auto scroll-thin max-h-96 overflow-y-auto">
            {unbinned.length === 0 ? <Empty>All stock is binned</Empty> : (
              <table className="zebra w-full text-sm">
                <thead className="sticky top-0 bg-card"><tr className="text-xs text-muted-foreground border-b">{["Item", "Wh", "Batch", "Qty"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {unbinned.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-5 py-2"><span className="font-mono text-xs">{itemMap.get(s.itemId)?.code}</span></td>
                      <td className="px-5 text-xs font-mono">{s.warehouseCode}</td>
                      <td className="px-5 font-mono text-xs">{s.batchNo ?? "—"}</td>
                      <td className="px-5 text-right tabular-nums">{qty(s.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <PutAwayDialog open={open} onOpenChange={setOpen} items={items ?? []} />
    </>
  );
}

function PutAwayDialog({ open, onOpenChange, items }: { open: boolean; onOpenChange: (o: boolean) => void; items: ItemRow[] }) {
  const [itemId, setItemId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [qtyVal, setQty] = useState("");
  const [binCode, setBinCode] = useState("");
  const putaway = useAction("POST", "/api/phase3/putaway", "Stock put away to bin");
  const submit = () => putaway.mutate({ itemId: Number(itemId), batchNo: batchNo || null, qty: Number(qtyVal), binCode } as never, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Put away to bin</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Item</Label><Select value={itemId} onValueChange={setItemId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger><SelectContent className="max-h-72">{items.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.code} — {it.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Batch no.</Label><Input className="mt-1" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs">Qty</Label><Input type="number" className="mt-1" value={qtyVal} onChange={(e) => setQty(e.target.value)} /></div><div><Label className="text-xs">Bin code</Label><Input className="mt-1 font-mono" placeholder="RM-A1-03" value={binCode} onChange={(e) => setBinCode(e.target.value)} /></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={putaway.isPending}>Put away</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
