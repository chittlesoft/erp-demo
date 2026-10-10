import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, PackageCheck, Trash2, FilePlus2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useItems, useParties, useAction, lookup, qty, inr, inr2, type Indent, type PoRow, type Grn } from "@/lib/erp";
import { PageIntro, StatusBadge, Empty } from "@/components/layout";

type Line = { itemId: string; qty: string; rate: string };

function NewPoDialog({ open, onOpenChange, fromIndents }: { open: boolean; onOpenChange: (o: boolean) => void; fromIndents: Indent[] }) {
  const items = (useItems().data ?? []).filter(i => i.type === "RM" || i.type === "CONSUMABLE");
  const I = lookup(items);
  const vendors = useParties("VENDOR").data ?? [];
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => {
    if (!open) return;
    setVendorId("");
    setLines(fromIndents.length ? fromIndents.map(i => ({ itemId: String(i.itemId), qty: String(i.qty), rate: String(I.get(i.itemId)?.stdCost ?? "") })) : [{ itemId: "", qty: "", rate: "" }]);
  }, [open]);
  const save = useAction("POST", "/api/pos", "Purchase order created");
  const total = lines.reduce((s, l) => s + (+l.qty || 0) * (+l.rate || 0), 0);
  const upd = (i: number, k: keyof Line, v: string) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === "itemId" ? { rate: String(I.get(+v)?.stdCost ?? "") } : {}) } : l)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>New purchase order</DialogTitle>{fromIndents.length > 0 && <DialogDescription>From {fromIndents.length} indent{fromIndents.length > 1 ? "s" : ""}: {fromIndents.map(i => i.indentNo).join(", ")}</DialogDescription>}</DialogHeader>
        <div className="space-y-1 max-w-sm"><Label>Vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}><SelectTrigger data-testid="select-po-vendor"><SelectValue placeholder="Choose vendor" /></SelectTrigger>
            <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name} · {v.city}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_110px_110px_36px] gap-2 items-end">
              <div className="space-y-1">{i === 0 && <Label className="text-xs">Item</Label>}
                <Select value={l.itemId} onValueChange={v => upd(i, "itemId", v)}><SelectTrigger data-testid={`select-po-item-${i}`}><SelectValue placeholder="Choose item" /></SelectTrigger>
                  <SelectContent>{items.map(it => <SelectItem key={it.id} value={String(it.id)}>{it.code} — {it.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1">{i === 0 && <Label className="text-xs">Qty</Label>}<Input type="number" step="any" value={l.qty} onChange={e => upd(i, "qty", e.target.value)} data-testid={`input-po-qty-${i}`} /></div>
              <div className="space-y-1">{i === 0 && <Label className="text-xs">Rate ₹</Label>}<Input type="number" step="any" value={l.rate} onChange={e => upd(i, "rate", e.target.value)} data-testid={`input-po-rate-${i}`} /></div>
              <div className="text-right text-sm tabular-nums pb-2">{inr((+l.qty || 0) * (+l.rate || 0))}</div>
              <Button variant="ghost" size="icon" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Remove line"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>))}
          <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, { itemId: "", qty: "", rate: "" }])} data-testid="button-po-add-line"><Plus className="h-3.5 w-3.5 mr-1" />Add line</Button>
        </div>
        <DialogFooter className="items-center gap-3">
          <span className="text-sm text-muted-foreground mr-auto">Taxable value <span className="font-semibold text-foreground tabular-nums">{inr(total)}</span> + GST</span>
          <Button disabled={!vendorId || save.isPending || lines.some(l => !l.itemId || !+l.qty || !+l.rate)} data-testid="button-save-po"
            onClick={() => save.mutate({ vendorId: +vendorId, indentIds: fromIndents.map(i => i.id), lines: lines.map(l => ({ itemId: +l.itemId, qty: +l.qty, rate: +l.rate })) }, { onSuccess: () => onOpenChange(false) })}>Create PO</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrnDialog({ po, onClose }: { po: PoRow | null; onClose: () => void }) {
  const I = lookup(useItems().data);
  const [inv, setInv] = useState("");
  const [rows, setRows] = useState<Record<number, { qty: string; batch: string }>>({});
  useEffect(() => { if (po) { setInv(""); setRows(Object.fromEntries(po.lines.map(l => [l.id, { qty: String(l.qty - l.receivedQty), batch: "" }]))); } }, [po?.id]);
  const save = useAction("POST", "/api/grns", "Goods received into QC Quarantine");
  if (!po) return null;
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Goods receipt against {po.poNo}</DialogTitle><DialogDescription>Material is received into QC Quarantine. Release it from Inventory after incoming inspection.</DialogDescription></DialogHeader>
        <div className="space-y-1 max-w-xs"><Label>Vendor invoice / challan no.</Label><Input value={inv} onChange={e => setInv(e.target.value.toUpperCase())} data-testid="input-grn-invoice" /></div>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium py-1">Item</th><th className="text-right font-medium">Pending</th><th className="text-left font-medium pl-3">Receive</th><th className="text-left font-medium pl-3">Supplier batch / lot</th></tr></thead>
          <tbody>{po.lines.map(l => { const it = I.get(l.itemId); const pend = l.qty - l.receivedQty; return (
            <tr key={l.id} className="border-t">
              <td className="py-2"><span className="font-mono text-xs">{it?.code}</span><div className="text-xs text-muted-foreground">{it?.name}</div></td>
              <td className="text-right tabular-nums">{qty(pend)} {it?.uom}</td>
              <td className="pl-3 w-28"><Input type="number" step="any" min="0" max={pend} disabled={pend <= 0} value={rows[l.id]?.qty ?? ""} onChange={e => setRows(r => ({ ...r, [l.id]: { ...r[l.id], qty: e.target.value } }))} data-testid={`input-grn-qty-${l.id}`} /></td>
              <td className="pl-3 w-44"><Input className="font-mono" disabled={pend <= 0} placeholder={it?.tracking === "batch" ? "Required" : "Optional"} value={rows[l.id]?.batch ?? ""} onChange={e => setRows(r => ({ ...r, [l.id]: { ...r[l.id], batch: e.target.value.toUpperCase() } }))} data-testid={`input-grn-batch-${l.id}`} /></td>
            </tr>); })}</tbody>
        </table>
        <DialogFooter><Button disabled={!inv || save.isPending} data-testid="button-save-grn"
          onClick={() => save.mutate({ poId: po.id, vendorInvoiceNo: inv, lines: po.lines.map(l => ({ poLineId: l.id, qty: +(rows[l.id]?.qty || 0), batchNo: rows[l.id]?.batch || null })) }, { onSuccess: onClose })}>Post GRN</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchasePage() {
  const I = lookup(useItems().data);
  const P = lookup(useParties().data);
  const indents = useQuery<Indent[]>({ queryKey: ["/api/indents"] }).data ?? [];
  const pos = useQuery<PoRow[]>({ queryKey: ["/api/pos"] }).data ?? [];
  const grns = useQuery<Grn[]>({ queryKey: ["/api/grns"] }).data ?? [];
  const [sel, setSel] = useState<number[]>([]);
  const [poOpen, setPoOpen] = useState(false);
  const [fromInd, setFromInd] = useState<Indent[]>([]);
  const [grnPo, setGrnPo] = useState<PoRow | null>(null);
  const PO = lookup(pos);
  const open = indents.filter(i => i.status === "OPEN");
  return (
    <>
      <PageIntro actions={<Button onClick={() => { setFromInd([]); setPoOpen(true); }} data-testid="button-new-po"><Plus className="h-4 w-4 mr-1" />New PO</Button>}>
        Indent → Purchase order → Goods receipt (GRN). Indents come from MRP shortages; GRNs post stock to QC Quarantine with supplier batch numbers and input GST.
      </PageIntro>
      <Tabs defaultValue="pos">
        <TabsList><TabsTrigger value="indents" data-testid="tab-indents">Indents {open.length > 0 && <span className="ml-1.5 rounded bg-accent text-accent-foreground px-1.5 text-[10px]">{open.length}</span>}</TabsTrigger><TabsTrigger value="pos" data-testid="tab-pos">Purchase orders</TabsTrigger><TabsTrigger value="grns" data-testid="tab-grns">Goods receipts</TabsTrigger></TabsList>
        <TabsContent value="indents">
          <Card>
            <div className="flex items-center gap-2 p-3 border-b"><span className="text-xs text-muted-foreground">{sel.length ? `${sel.length} selected` : "Select open indents to convert into a PO"}</span>
              <Button size="sm" className="ml-auto" disabled={!sel.length} onClick={() => { setFromInd(indents.filter(i => sel.includes(i.id))); setPoOpen(true); setSel([]); }} data-testid="button-indent-to-po"><FilePlus2 className="h-3.5 w-3.5 mr-1" />Create PO</Button></div>
            <CardContent className="p-0 overflow-x-auto">{!indents.length ? <Empty>No indents. Raise them from MRP Planning.</Empty> : (
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="w-10" /><th className="text-left font-medium px-3 py-2">Indent</th><th className="text-left font-medium px-3">Item</th><th className="text-right font-medium px-3">Qty</th><th className="text-left font-medium px-3">Required by</th><th className="text-left font-medium px-3">Status</th></tr></thead>
                <tbody>{indents.map(i => { const it = I.get(i.itemId); return (
                  <tr key={i.id} className="border-b last:border-0" data-testid={`row-indent-${i.id}`}>
                    <td className="pl-4">{i.status === "OPEN" && <Checkbox checked={sel.includes(i.id)} onCheckedChange={c => setSel(s => (c ? [...s, i.id] : s.filter(x => x !== i.id)))} data-testid={`checkbox-indent-${i.id}`} />}</td>
                    <td className="px-3 py-2 font-mono text-xs">{i.indentNo}</td><td className="px-3"><span className="font-mono text-xs">{it?.code}</span> <span className="text-xs text-muted-foreground">{it?.name}</span></td>
                    <td className="px-3 text-right tabular-nums">{qty(i.qty)} <span className="text-xs text-muted-foreground">{it?.uom}</span></td><td className="px-3 text-xs tabular-nums">{i.requiredBy}</td>
                    <td className="px-3">{i.status === "OPEN" ? <StatusBadge status="OPEN" /> : <span className="text-xs text-muted-foreground">→ {PO.get(i.poId!)?.poNo}</span>}</td>
                  </tr>); })}</tbody>
              </table>)}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pos">
          <Card><CardContent className="p-0 overflow-x-auto">{!pos.length ? <Empty>No purchase orders</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">PO</th><th className="text-left font-medium px-3">Vendor</th><th className="text-left font-medium px-3">Date</th><th className="text-left font-medium px-3">Lines (received / ordered)</th><th className="text-right font-medium px-3">Value</th><th className="text-left font-medium px-3">Status</th><th className="px-3" /></tr></thead>
              <tbody>{pos.map(p => (
                <tr key={p.id} className="border-b last:border-0 align-top" data-testid={`row-po-${p.id}`}>
                  <td className="px-4 py-2 font-mono text-xs">{p.poNo}</td><td className="px-3 py-2">{P.get(p.vendorId)?.name}</td><td className="px-3 py-2 text-xs tabular-nums">{p.date}</td>
                  <td className="px-3 py-2 text-xs space-y-0.5">{p.lines.map(l => <div key={l.id}><span className="font-mono">{I.get(l.itemId)?.code}</span> <span className="tabular-nums text-muted-foreground">{qty(l.receivedQty)} / {qty(l.qty)}</span></div>)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{inr(p.lines.reduce((s, l) => s + l.qty * l.rate, 0))}</td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-1.5 text-right">{p.status !== "CLOSED" && <Button size="sm" variant="outline" onClick={() => setGrnPo(p)} data-testid={`button-receive-po-${p.id}`}><PackageCheck className="h-3.5 w-3.5 mr-1" />Receive</Button>}</td>
                </tr>))}</tbody>
            </table>)}</CardContent></Card>
        </TabsContent>
        <TabsContent value="grns">
          <Card><CardContent className="p-0 overflow-x-auto">{!grns.length ? <Empty>No goods receipts</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">GRN</th><th className="text-left font-medium px-3">Date</th><th className="text-left font-medium px-3">PO / Vendor</th><th className="text-left font-medium px-3">Vendor invoice</th><th className="text-right font-medium px-3">Taxable</th><th className="text-right font-medium px-3">Input GST</th><th className="text-right font-medium px-4">Total</th></tr></thead>
              <tbody>{grns.map(g => { const po = PO.get(g.poId); return (
                <tr key={g.id} className="border-b last:border-0" data-testid={`row-grn-${g.id}`}>
                  <td className="px-4 py-2 font-mono text-xs">{g.grnNo}</td><td className="px-3 text-xs tabular-nums">{g.date}</td>
                  <td className="px-3"><span className="font-mono text-xs">{po?.poNo}</span><div className="text-xs text-muted-foreground">{po && P.get(po.vendorId)?.name}</div></td>
                  <td className="px-3 font-mono text-xs">{g.vendorInvoiceNo}</td><td className="px-3 text-right tabular-nums">{inr2(g.taxable)}</td>
                  <td className="px-3 text-right tabular-nums text-xs">{g.igst ? `IGST ${inr2(g.igst)}` : `C+S ${inr2(g.cgst + g.sgst)}`}</td><td className="px-4 text-right tabular-nums font-medium">{inr2(g.total)}</td>
                </tr>); })}</tbody>
            </table>)}</CardContent></Card>
        </TabsContent>
      </Tabs>
      <NewPoDialog open={poOpen} onOpenChange={setPoOpen} fromIndents={fromInd} />
      <GrnDialog po={grnPo} onClose={() => setGrnPo(null)} />
    </>
  );
}
