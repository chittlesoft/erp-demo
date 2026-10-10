"use client";
import { useState } from "react";
import { Plus, FileText, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useApi, useAction, lookup, inr2, qty } from "@/lib/erp/client";
import type { ItemRow, Party, Indent, PurchaseOrder, PoLine, Grn } from "@/lib/erp/shared";
import { PageIntro, Empty, StatusBadge } from "../shared";

export default function PurchasePage() {
  const { data: indents } = useApi<(Indent & { item: ItemRow })[]>("/api/purchase/indents");
  const { data: pos } = useApi<(PurchaseOrder & { vendor: Party; lines: (PoLine & { item: ItemRow })[]; grns: Grn[] })[]>("/api/purchase/pos");
  const { data: grns } = useApi<(Grn & { po: { vendor: Party } })[]>("/api/purchase/grns");
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const { data: vendors } = useApi<Party[]>("/api/parties?role=VENDOR");

  return (
    <>
      <PageIntro>
        Indent → Purchase order → GRN. Goods receipt lands in QC quarantine with mandatory supplier batch; GST split is intra-state (CGST+SGST) or inter-state (IGST).
      </PageIntro>
      <Tabs defaultValue="po">
        <TabsList><TabsTrigger value="po">Purchase orders</TabsTrigger><TabsTrigger value="grn">GRNs</TabsTrigger><TabsTrigger value="indent">Indents</TabsTrigger></TabsList>
        <TabsContent value="po" className="mt-4"><POList pos={pos ?? []} items={items ?? []} vendors={vendors ?? []} indents={indents ?? []} /></TabsContent>
        <TabsContent value="grn" className="mt-4"><GrnList grns={grns ?? []} pos={pos ?? []} /></TabsContent>
        <TabsContent value="indent" className="mt-4"><IndentList indents={indents ?? []} /></TabsContent>
      </Tabs>
    </>
  );
}

function POList({ pos, items, vendors, indents }: { pos: (PurchaseOrder & { vendor: Party; lines: (PoLine & { item: ItemRow })[]; grns: Grn[] })[]; items: ItemRow[]; vendors: Party[]; indents: (Indent & { item: ItemRow })[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2 flex items-center"><h2 className="text-sm font-semibold">Purchase orders</h2><div className="ml-auto"><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />New PO</Button></div></div>
      <div className="overflow-x-auto scroll-thin">
        {pos.length === 0 ? <Empty>No purchase orders</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">{["PO no.", "Vendor", "Date", "Lines", "Value", "Status", ""].map((h, i) => <th key={i} className="font-medium px-5 py-2 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {pos.map((po) => {
                const value = po.lines.reduce((s, l) => s + l.qty * l.rate, 0);
                return (
                  <tr key={po.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-2 font-mono text-xs">{po.poNo}</td>
                    <td className="px-5">{po.vendor.name}</td>
                    <td className="px-5 text-xs tabular-nums">{po.date}</td>
                    <td className="px-5 text-xs">{po.lines.length}</td>
                    <td className="px-5 text-right tabular-nums">{inr2(value)}</td>
                    <td className="px-5"><StatusBadge status={po.status} /></td>
                    <td className="px-5 text-xs text-muted-foreground">{po.grns.length} GRN{po.grns.length !== 1 ? "s" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <PODialog open={open} onOpenChange={setOpen} items={items} vendors={vendors} indents={indents} />
    </div>
  );
}

function PODialog({ open, onOpenChange, items, vendors, indents }: { open: boolean; onOpenChange: (o: boolean) => void; items: ItemRow[]; vendors: Party[]; indents: (Indent & { item: ItemRow })[] }) {
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState<{ itemId: string; qty: string; rate: string }[]>([{ itemId: "", qty: "", rate: "" }]);
  const [selIndents, setSelIndents] = useState<number[]>([]);
  const create = useAction("POST", "/api/purchase/pos/create", "PO created");
  const submit = () => create.mutate({ vendorId: Number(vendorId), indentIds: selIndents, lines: lines.filter((l) => l.itemId && l.qty).map((l) => ({ itemId: Number(l.itemId), qty: Number(l.qty), rate: Number(l.rate) })) } as never, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name} · {v.gstin}</SelectItem>)}</SelectContent></Select>
          </div>
          {indents.length > 0 && (
            <div><Label className="text-xs">Link open indents (optional)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">{indents.filter((i) => i.status === "OPEN").map((i) => <button key={i.id} type="button" onClick={() => setSelIndents((s) => s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id])} className={`text-xs rounded px-2 py-1 border ${selIndents.includes(i.id) ? "bg-accent text-accent-foreground border-accent" : "bg-background"}`}>{i.indentNo} · {i.item.code} ×{qty(i.qty)}</button>)}</div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs">Lines</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Select value={l.itemId} onValueChange={(v) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, itemId: v, rate: x.rate || String(items.find((it) => it.id === Number(v))?.stdCost ?? "") } : x))}><SelectTrigger className="col-span-7"><SelectValue placeholder="Item" /></SelectTrigger><SelectContent className="max-h-60">{items.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.code} — {it.name}</SelectItem>)}</SelectContent></Select>
                <Input className="col-span-2" type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                <Input className="col-span-2" type="number" placeholder="Rate" value={l.rate} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { itemId: "", qty: "", rate: "" }])}><Plus className="h-3.5 w-3.5 mr-1" />Add line</Button>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={!vendorId || lines.every((l) => !l.itemId) || create.isPending}>Create PO</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrnList({ grns, pos }: { grns: (Grn & { po: { vendor: Party } })[]; pos: (PurchaseOrder & { vendor: Party; lines: (PoLine & { item: ItemRow })[] })[] }) {
  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState("");
  const [lines, setLines] = useState<{ poLineId: number; qty: string; batchNo: string }[]>([]);
  const create = useAction("POST", "/api/purchase/grns/create", "GRN created — goods in QC quarantine");
  const po = pos.find((p) => p.id === Number(poId));
  const onPo = (v: string) => { setPoId(v); const p = pos.find((x) => x.id === Number(v)); setLines(p ? p.lines.map((l) => ({ poLineId: l.id, qty: String(Math.max(0, l.qty - l.receivedQty)), batchNo: "" })) : []); };
  const submit = () => create.mutate({ poId: Number(poId), vendorInvoiceNo, lines: lines.filter((l) => Number(l.qty) > 0).map((l) => ({ poLineId: l.poLineId, qty: Number(l.qty), batchNo: l.batchNo || null })) } as never, { onSuccess: () => onOpenChange(false) });
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2 flex items-center"><h2 className="text-sm font-semibold">Goods receipt notes</h2><div className="ml-auto"><Button size="sm" onClick={() => setOpen(true)}><PackageCheck className="h-3.5 w-3.5 mr-1" />New GRN</Button></div></div>
      <div className="overflow-x-auto scroll-thin">
        {grns.length === 0 ? <Empty>No GRNs</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">{["GRN no.", "Vendor", "Date", "Vendor inv.", "Taxable", "Total", ""].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {grns.map((g) => (
                <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-2 font-mono text-xs">{g.grnNo}</td>
                  <td className="px-5">{g.po.vendor.name}</td>
                  <td className="px-5 text-xs tabular-nums">{g.date}</td>
                  <td className="px-5 text-xs font-mono">{g.vendorInvoiceNo}</td>
                  <td className="px-5 text-right tabular-nums">{inr2(g.taxable)}</td>
                  <td className="px-5 text-right tabular-nums font-medium">{inr2(g.total)}</td>
                  <td className="px-5 text-[11px] text-muted-foreground">{g.cgst > 0 ? "CGST+SGST" : "IGST"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New GRN against PO</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Purchase order</Label>
              <Select value={poId} onValueChange={onPo}><SelectTrigger className="mt-1"><SelectValue placeholder="Select PO" /></SelectTrigger>
                <SelectContent>{pos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.poNo} — {p.vendor.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs">Vendor invoice no.</Label><Input className="mt-1" value={vendorInvoiceNo} onChange={(e) => setVendorInvoiceNo(e.target.value)} /></div>
            {po && (
              <div className="space-y-2">
                <Label className="text-xs">Receipt lines</Label>
                {lines.map((l, i) => {
                  const pl = po.lines.find((x) => x.id === l.poLineId);
                  const item = pl?.item;
                  return (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 text-xs"><span className="font-mono">{item?.code}</span><span className="text-muted-foreground"> (pending {qty(pl ? pl.qty - pl.receivedQty : 0)})</span></div>
                      <Input className="col-span-3" type="number" placeholder="Receive qty" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                      <Input className="col-span-4" placeholder={item?.tracking === "batch" ? "Batch no. (req.)" : "Batch (opt.)"} value={l.batchNo} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, batchNo: e.target.value } : x))} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={!poId || !vendorInvoiceNo || create.isPending}>Receive &amp; create GRN</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IndentList({ indents }: { indents: (Indent & { item: ItemRow })[] }) {
  const [itemId, setItemId] = useState("");
  const [qtyVal, setQty] = useState("");
  const [requiredBy, setRequiredBy] = useState(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const create = useAction("POST", "/api/purchase/indents", "Indent raised");
  const submit = () => create.mutate({ itemId: Number(itemId), qty: Number(qtyVal), requiredBy } as never, { onSuccess: () => onOpenChange(false) });
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2 flex items-center"><h2 className="text-sm font-semibold">Purchase indents</h2><div className="ml-auto"><Button size="sm" onClick={() => setOpen(true)}><FileText className="h-3.5 w-3.5 mr-1" />New indent</Button></div></div>
      <div className="overflow-x-auto scroll-thin">
        {indents.length === 0 ? <Empty>No indents</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">{["Indent", "Item", "Qty", "Required by", "Status"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {indents.map((i) => (
                <tr key={i.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-2 font-mono text-xs">{i.indentNo}</td>
                  <td className="px-5"><span className="font-mono text-xs">{i.item.code}</span><span className="text-xs text-muted-foreground block">{i.item.name}</span></td>
                  <td className="px-5 text-right tabular-nums">{qty(i.qty)} {i.item.uom}</td>
                  <td className="px-5 text-xs tabular-nums">{i.requiredBy}</td>
                  <td className="px-5"><StatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New purchase indent</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Item</Label><Select value={itemId} onValueChange={setItemId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger><SelectContent className="max-h-72">{(items ?? []).map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.code} — {it.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs">Qty</Label><Input type="number" className="mt-1" value={qtyVal} onChange={(e) => setQty(e.target.value)} /></div><div><Label className="text-xs">Required by</Label><Input type="date" className="mt-1" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} /></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={!itemId || !qtyVal || create.isPending}>Raise indent</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
