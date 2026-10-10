import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Truck, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATES } from "@shared/schema";
import { useItems, useParties, useSettings, useAction, lookup, qty, inr, inr2, type SoRow, type Invoice } from "@/lib/erp";
import { PageIntro, StatusBadge, Empty } from "@/components/layout";
import { usePdiStatus } from "@/pages/pdi";
import { NotesTab } from "@/pages/notes";

type Line = { itemId: string; qty: string; rate: string };

function NewSoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const fgs = (useItems().data ?? []).filter(i => i.type === "FG");
  const customers = useParties("CUSTOMER").data ?? [];
  const [f, setF] = useState({ customerId: "", customerPo: "", deliveryDate: "" });
  const [lines, setLines] = useState<Line[]>([{ itemId: "", qty: "", rate: "" }]);
  useEffect(() => { if (open) { setF({ customerId: "", customerPo: "", deliveryDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) }); setLines([{ itemId: "", qty: "", rate: "" }]); } }, [open]);
  const save = useAction("POST", "/api/sos", "Sales order booked");
  const upd = (i: number, k: keyof Line, v: string) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + (+l.qty || 0) * (+l.rate || 0), 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Book sales order</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Customer</Label>
            <Select value={f.customerId} onValueChange={v => setF({ ...f, customerId: v })}><SelectTrigger data-testid="select-so-customer"><SelectValue placeholder="Choose OEM" /></SelectTrigger>
              <SelectContent>{customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Customer PO no.</Label><Input value={f.customerPo} onChange={e => setF({ ...f, customerPo: e.target.value.toUpperCase() })} data-testid="input-so-custpo" /></div>
          <div className="space-y-1"><Label>Delivery date</Label><Input type="date" value={f.deliveryDate} onChange={e => setF({ ...f, deliveryDate: e.target.value })} data-testid="input-so-delivery" /></div>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const it = fgs.find(x => String(x.id) === l.itemId);
            return (
              <div key={i} className="grid grid-cols-[1fr_90px_110px_110px_36px] gap-2 items-end">
                <div className="space-y-1">{i === 0 && <Label className="text-xs">Sensor</Label>}
                  <Select value={l.itemId} onValueChange={v => upd(i, "itemId", v)}><SelectTrigger data-testid={`select-so-item-${i}`}><SelectValue placeholder="Choose sensor" /></SelectTrigger>
                    <SelectContent>{fgs.map(x => <SelectItem key={x.id} value={String(x.id)}>{x.code} — {x.name} ({qty(x.onHand)} in stock)</SelectItem>)}</SelectContent></Select>
                  {it?.customerPartNo && <div className="text-[11px] text-muted-foreground">OEM part {it.customerPartNo}</div>}</div>
                <div className="space-y-1">{i === 0 && <Label className="text-xs">Qty</Label>}<Input type="number" min="1" value={l.qty} onChange={e => upd(i, "qty", e.target.value)} data-testid={`input-so-qty-${i}`} /></div>
                <div className="space-y-1">{i === 0 && <Label className="text-xs">Rate ₹</Label>}<Input type="number" step="any" value={l.rate} onChange={e => upd(i, "rate", e.target.value)} data-testid={`input-so-rate-${i}`} /></div>
                <div className="text-right text-sm tabular-nums pb-2">{inr((+l.qty || 0) * (+l.rate || 0))}</div>
                <Button variant="ghost" size="icon" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Remove line"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>);
          })}
          <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, { itemId: "", qty: "", rate: "" }])} data-testid="button-so-add-line"><Plus className="h-3.5 w-3.5 mr-1" />Add line</Button>
        </div>
        <DialogFooter className="items-center gap-3">
          <span className="text-sm text-muted-foreground mr-auto">Order value <span className="font-semibold text-foreground tabular-nums">{inr(total)}</span> + GST</span>
          <Button disabled={!f.customerId || !f.customerPo || save.isPending || lines.some(l => !l.itemId || !+l.qty || !+l.rate)} data-testid="button-save-so"
            onClick={() => save.mutate({ customerId: +f.customerId, customerPo: f.customerPo, deliveryDate: f.deliveryDate, lines: lines.map(l => ({ itemId: +l.itemId, qty: +l.qty, rate: +l.rate })) }, { onSuccess: () => onOpenChange(false) })}>Book order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DispatchDialog({ so, onClose }: { so: SoRow | null; onClose: () => void }) {
  const I = lookup(useItems().data);
  const P = lookup(useParties().data);
  const cfg = useSettings().data;
  const [rows, setRows] = useState<Record<number, string>>({});
  const [t, setT] = useState({ vehicleNo: "", transporter: "", distanceKm: "" });
  useEffect(() => {
    if (!so) return;
    setRows(Object.fromEntries(so.lines.map(l => [l.id, String(Math.min(l.qty - l.dispatchedQty, Math.floor(I.get(l.itemId)?.onHand ?? 0)))])));
    setT({ vehicleNo: "", transporter: "", distanceKm: String(P.get(so.customerId)?.distanceKm ?? "") });
  }, [so?.id]);
  const save = useAction("POST", "/api/invoices", "Tax invoice created — stock and serials dispatched");
  const ppapKey = so ? `/api/qc/ppap-check?customerId=${so.customerId}&items=${so.lines.map(l => l.itemId).join(",")}` : "";
  const ppap = useQuery<{ itemId: number; status: string | null; ok: boolean; remarks: string }[]>({ queryKey: [ppapKey], enabled: !!so }).data ?? [];
  const pdiSt = usePdiStatus(so?.id);
  if (!so) return null;
  const pdiOf = (lineId: number) => pdiSt.find(x => x.soLineId === lineId);
  const pdiShort = so.lines.filter(l => { const s = pdiOf(l.id); return s?.required && (+rows[l.id] || 0) > s.covered; });
  const pp = (itemId: number) => ppap.find(p => p.itemId === itemId);
  const blocked = so.lines.filter(l => (+rows[l.id] || 0) > 0 && pp(l.itemId) && !pp(l.itemId)!.ok);
  const cust = P.get(so.customerId);
  const intra = cfg && cust && cfg.stateCode === cust.stateCode;
  const taxable = so.lines.reduce((s, l) => s + (+rows[l.id] || 0) * l.rate, 0);
  const gst = so.lines.reduce((s, l) => s + (+rows[l.id] || 0) * l.rate * (I.get(l.itemId)?.gstRate ?? 18) / 100, 0);
  const ewbNeeded = taxable + gst > 50000;
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Dispatch & invoice — {so.soNo}</DialogTitle>
          <DialogDescription>{cust?.name} · place of supply {cust?.stateCode} {cust && STATES[cust.stateCode]} · {intra ? "CGST + SGST" : "IGST"}</DialogDescription></DialogHeader>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium py-1">Sensor</th><th className="text-right font-medium">Pending</th><th className="text-right font-medium">FG stock</th><th className="text-left font-medium pl-3">PPAP</th><th className="text-left font-medium pl-3">PDI</th><th className="text-left font-medium pl-3">Dispatch</th></tr></thead>
          <tbody>{so.lines.map(l => { const it = I.get(l.itemId); const pend = l.qty - l.dispatchedQty; return (
            <tr key={l.id} className="border-t">
              <td className="py-2"><span className="font-mono text-xs">{it?.code}</span><div className="text-xs text-muted-foreground">{it?.name}</div></td>
              <td className="text-right tabular-nums">{qty(pend)}</td><td className={`text-right tabular-nums ${(it?.onHand ?? 0) < pend ? "text-destructive" : ""}`}>{qty(it?.onHand ?? 0)}</td>
              <td className="pl-3" data-testid={`ppap-${l.id}`}>{pp(l.itemId)?.status ? <StatusBadge status={pp(l.itemId)!.status!} /> : <span className="text-[11px] text-muted-foreground">No record</span>}</td>
              <td className="pl-3 text-xs" data-testid={`pdi-${l.id}`}>{pdiOf(l.id)?.required ? <span className={(+rows[l.id] || 0) > (pdiOf(l.id)?.covered ?? 0) ? "text-destructive font-medium" : "text-emerald-700 dark:text-emerald-400 font-medium"}>{qty(pdiOf(l.id)!.covered)} accepted</span> : <span className="text-muted-foreground">Not required</span>}</td>
              <td className="pl-3 w-28"><Input type="number" min="0" max={pend} disabled={pend <= 0} value={rows[l.id] ?? ""} onChange={e => setRows(r => ({ ...r, [l.id]: e.target.value }))} data-testid={`input-dispatch-qty-${l.id}`} /></td>
            </tr>); })}</tbody>
        </table>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Vehicle no.</Label><Input className="font-mono" value={t.vehicleNo} onChange={e => setT({ ...t, vehicleNo: e.target.value.toUpperCase() })} placeholder="MH12 AB 1234" data-testid="input-vehicle" /></div>
          <div className="space-y-1"><Label>Transporter</Label><Input value={t.transporter} onChange={e => setT({ ...t, transporter: e.target.value })} data-testid="input-transporter" /></div>
          <div className="space-y-1"><Label>Distance km</Label><Input type="number" value={t.distanceKm} onChange={e => setT({ ...t, distanceKm: e.target.value })} data-testid="input-distance" /></div>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
          <span>Taxable <b className="tabular-nums">{inr2(taxable)}</b></span><span>GST <b className="tabular-nums">{inr2(gst)}</b></span><span>Total <b className="tabular-nums">{inr2(taxable + gst)}</b></span>
          <span className={ewbNeeded ? "text-[hsl(var(--chart-2))] font-medium" : "text-muted-foreground"}>{ewbNeeded ? "E-way bill required (> ₹50,000) — generate it on the invoice after the IRN" : "E-way bill not required"}</span>
        </div>
        {blocked.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="text-ppap-blocked">
          PPAP is not approved for {blocked.map(l => I.get(l.itemId)?.code).join(", ")} with this customer. Set dispatch quantity to 0 for {blocked.length > 1 ? "these lines" : "this line"}, or record PSW / interim approval in Quality → PPAP register.</div>}
        {pdiShort.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="text-pdi-blocked">
          Pre-dispatch inspection does not cover the dispatch quantity for {pdiShort.map(l => I.get(l.itemId)?.code).join(", ")}. Complete PDI in Quality → Pre-dispatch (PDI), or reduce the quantity.</div>}
        <DialogFooter><Button disabled={save.isPending || taxable <= 0 || blocked.length > 0 || pdiShort.length > 0} data-testid="button-save-invoice"
          onClick={() => save.mutate({ soId: so.id, lines: so.lines.map(l => ({ soLineId: l.id, qty: +(rows[l.id] || 0) })), vehicleNo: t.vehicleNo || null, transporter: t.transporter || null, distanceKm: +t.distanceKm || 0 }, { onSuccess: onClose })}>Create tax invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesPage() {
  const I = lookup(useItems().data);
  const P = lookup(useParties().data);
  const sos = useQuery<SoRow[]>({ queryKey: ["/api/sos"] }).data ?? [];
  const invs = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] }).data ?? [];
  const SO = lookup(sos);
  const [newOpen, setNewOpen] = useState(false);
  const [disp, setDisp] = useState<SoRow | null>(null);
  const pendingIrn = invs.filter(i => !i.irn && i.status !== "CANCELLED").length;
  return (
    <>
      <PageIntro actions={<Button onClick={() => setNewOpen(true)} data-testid="button-new-so"><Plus className="h-4 w-4 mr-1" />New sales order</Button>}>
        OEM sales orders → dispatch from Finished Goods (FIFO serials) → GST tax invoice → IRN and e-way bill through the GST portal connection. Corrections after 24 hours go through credit / debit notes.
      </PageIntro>
      <Tabs defaultValue="sos">
        <TabsList><TabsTrigger value="sos" data-testid="tab-sos">Sales orders</TabsTrigger><TabsTrigger value="invoices" data-testid="tab-invoices">Tax invoices {pendingIrn > 0 && <span className="ml-1.5 rounded bg-accent text-accent-foreground px-1.5 text-[10px]">{pendingIrn} IRN pending</span>}</TabsTrigger><TabsTrigger value="notes" data-testid="tab-notes">Credit / debit notes</TabsTrigger></TabsList>
        <TabsContent value="sos">
          <Card><CardContent className="p-0 overflow-x-auto">{!sos.length ? <Empty>No sales orders</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">SO</th><th className="text-left font-medium px-3">Customer / PO</th><th className="text-left font-medium px-3">Delivery</th><th className="text-left font-medium px-3">Lines (dispatched / ordered)</th><th className="text-right font-medium px-3">Value</th><th className="text-left font-medium px-3">Status</th><th className="px-3" /></tr></thead>
              <tbody>{sos.map(s => { const late = s.status !== "CLOSED" && s.deliveryDate < new Date().toISOString().slice(0, 10); return (
                <tr key={s.id} className="border-b last:border-0 align-top" data-testid={`row-so-${s.id}`}>
                  <td className="px-4 py-2 font-mono text-xs">{s.soNo}</td>
                  <td className="px-3 py-2">{P.get(s.customerId)?.name}<div className="text-[11px] text-muted-foreground font-mono">{s.customerPo}</div></td>
                  <td className={`px-3 py-2 text-xs tabular-nums ${late ? "text-destructive font-medium" : ""}`}>{s.deliveryDate}{late && <div>overdue</div>}</td>
                  <td className="px-3 py-2 text-xs space-y-0.5">{s.lines.map(l => <div key={l.id}><span className="font-mono">{I.get(l.itemId)?.code}</span> <span className="tabular-nums text-muted-foreground">{qty(l.dispatchedQty)} / {qty(l.qty)}</span></div>)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{inr(s.lines.reduce((a, l) => a + l.qty * l.rate, 0))}</td>
                  <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-1.5 text-right">{s.status !== "CLOSED" && <Button size="sm" variant="outline" onClick={() => setDisp(s)} data-testid={`button-dispatch-${s.id}`}><Truck className="h-3.5 w-3.5 mr-1" />Dispatch</Button>}</td>
                </tr>); })}</tbody>
            </table>)}</CardContent></Card>
        </TabsContent>
        <TabsContent value="invoices">
          <Card><CardContent className="p-0 overflow-x-auto">{!invs.length ? <Empty>No invoices yet</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Invoice</th><th className="text-left font-medium px-3">Date</th><th className="text-left font-medium px-3">Customer</th><th className="text-right font-medium px-3">Taxable</th><th className="text-right font-medium px-3">GST</th><th className="text-right font-medium px-3">Total</th><th className="text-left font-medium px-3">E-invoice</th><th className="text-left font-medium px-3">E-way bill</th></tr></thead>
              <tbody>{invs.map(v => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-invoice-${v.id}`}>
                  <td className="px-4 py-2"><Link href={`/invoice/${v.id}`} className="font-mono text-xs text-primary hover:underline" data-testid={`link-invoice-${v.id}`}>{v.invNo}</Link><div className="text-[11px] text-muted-foreground font-mono">{SO.get(v.soId)?.soNo}</div></td>
                  <td className="px-3 text-xs tabular-nums">{v.date}</td><td className="px-3">{P.get(v.customerId)?.name}</td>
                  <td className="px-3 text-right tabular-nums">{inr2(v.taxable)}</td><td className="px-3 text-right tabular-nums text-xs">{v.igst ? `IGST ${inr2(v.igst)}` : `C+S ${inr2(v.cgst + v.sgst)}`}</td>
                  <td className="px-3 text-right tabular-nums font-medium">{inr2(v.total)}</td>
                  <td className="px-3"><StatusBadge status={v.status === "CANCELLED" ? "CANCELLED" : v.irn ? "IRN_OK" : "IRN_PENDING"} /></td>
                  <td className="px-3 text-xs">{v.status === "CANCELLED" ? <span className="text-muted-foreground">-</span> : v.total <= 50000 ? <span className="text-muted-foreground">Not required</span> : v.ewbNo ? <span className="font-mono">{v.ewbNo}</span> : <span className="text-[hsl(var(--chart-2))] font-medium">Pending</span>}</td>
                </tr>))}</tbody>
            </table>)}</CardContent></Card>
        </TabsContent>
        <TabsContent value="notes"><NotesTab /></TabsContent>
      </Tabs>
      <NewSoDialog open={newOpen} onOpenChange={setNewOpen} />
      <DispatchDialog so={disp} onClose={() => setDisp(null)} />
    </>
  );
}
