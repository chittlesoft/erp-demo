import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, FileJson, Printer, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { STATES } from "@shared/schema";
import { API_BASE } from "@/lib/queryClient";
import { useParties, useSettings, useAction, lookup, qty, inr2, amountInWords, type Invoice, type InvoiceLine, type SoRow } from "@/lib/erp";
import { StatusBadge } from "@/components/layout";
import type { PdiReport } from "@/pages/pdi";
import { EDocPanel, IrnPrintBlock, useEDoc } from "@/components/edoc";
import { NoteDialog, type Note } from "@/pages/notes";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invs = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const sos = lookup(useQuery<SoRow[]>({ queryKey: ["/api/sos"] }).data);
  const P = lookup(useParties().data);
  const cfg = useSettings().data;
  const inv = invs.data?.find(i => i.id === +id);
  const [f, setF] = useState({ irn: "", ackNo: "", ewbNo: "" });
  useEffect(() => { if (inv) setF({ irn: inv.irn ?? "", ackNo: inv.ackNo ?? "", ewbNo: inv.ewbNo ?? "" }); }, [inv?.id, inv?.irn, inv?.ewbNo]);
  const save = useAction("PATCH", `/api/invoices/${id}/irn`, "E-invoice details saved");
  const pdis = useQuery<PdiReport[]>({ queryKey: [`/api/pdi/invoice/${id}`] }).data ?? [];
  const notes = useQuery<Note[]>({ queryKey: [`/api/invoices/${id}/notes`] }).data ?? [];
  const e = useEDoc("INV", id).data ?? null;
  const [noteOpen, setNoteOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const voidInv = useAction("POST", `/api/invoices/${id}/void`, "Invoice cancelled — stock and order quantities reversed");
  if (!inv || !cfg) return <Skeleton className="h-96" />;
  const b = P.get(inv.customerId);
  const so = sos.get(inv.soId);
  const lines = JSON.parse(inv.lines) as InvoiceLine[];
  const intra = !inv.igst;
  const cancelled = inv.status === "CANCELLED";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/sales"><Button variant="ghost" size="sm" data-testid="button-back"><ArrowLeft className="h-4 w-4 mr-1" />Sales</Button></Link>
        <div className="ml-auto flex gap-2">
          <a href={`${API_BASE}/api/invoices/${inv.id}/einvoice.json`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" data-testid="button-download-einvoice"><FileJson className="h-4 w-4 mr-1" />E-invoice JSON</Button></a>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print"><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>
      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Card className="print:shadow-none print:border-0 relative overflow-hidden">
          {cancelled && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-6xl font-bold text-destructive/15 -rotate-12" data-testid="text-cancelled">CANCELLED</span></div>}
          <CardContent className="p-6 space-y-5 text-sm">
            <div className="flex flex-wrap items-start gap-4 border-b pb-4">
              <div><div className="text-base font-semibold">{cfg.legalName}</div><div className="text-xs text-muted-foreground">{cfg.address}, {cfg.city} {cfg.pincode}</div><div className="text-xs font-mono mt-1">GSTIN {cfg.gstin || <span className="text-destructive font-sans">not entered — add in Tally & Company</span>} · State {cfg.stateCode} {STATES[cfg.stateCode]}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">CIN {cfg.cin} · {cfg.phone} · {cfg.email}</div>
                {cfg.plantAddress && <div className="text-[11px] text-muted-foreground">Dispatch from: {cfg.plantAddress}, {cfg.plantCity} {cfg.plantPincode}</div>}</div>
              <div className="ml-auto text-right"><div className="text-xs uppercase tracking-wider text-muted-foreground">Tax Invoice</div><div className="font-mono font-semibold" data-testid="text-invoice-no">{inv.invNo}</div><div className="text-xs tabular-nums">{inv.date.split("-").reverse().join("/")}</div></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><div className="text-xs text-muted-foreground mb-1">Bill to / Ship to</div><div className="font-medium">{b?.name}</div><div className="text-xs text-muted-foreground">{b?.address}, {b?.city} {b?.pincode}</div><div className="text-xs font-mono mt-1">GSTIN {b?.gstin}</div></div>
              <div className="text-xs space-y-0.5 sm:text-right">
                <div>Place of supply: <b>{inv.placeOfSupply} · {STATES[inv.placeOfSupply]}</b></div>
                <div>Customer PO: <span className="font-mono">{so?.customerPo}</span> · SO <span className="font-mono">{so?.soNo}</span></div>
                {inv.vehicleNo && <div>Vehicle <span className="font-mono">{inv.vehicleNo}</span>{inv.transporter && ` · ${inv.transporter}`} · {inv.distanceKm} km</div>}
              </div>
            </div>
            <IrnPrintBlock e={e} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-y bg-muted/40 text-muted-foreground"><th className="text-left font-medium p-2">#</th><th className="text-left font-medium p-2">Description</th><th className="text-left font-medium p-2">HSN</th><th className="text-right font-medium p-2">Qty</th><th className="text-right font-medium p-2">Rate</th><th className="text-right font-medium p-2">Taxable</th>{intra ? <><th className="text-right font-medium p-2">CGST</th><th className="text-right font-medium p-2">SGST</th></> : <th className="text-right font-medium p-2">IGST</th>}</tr></thead>
                <tbody>{lines.map((l, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2"><div className="font-medium text-sm">{l.name}</div>{l.customerPartNo && <div className="text-muted-foreground italic">Customer part no. - {l.customerPartNo}</div>}<div className="text-muted-foreground italic">Tau No - {l.code}</div>
                      {l.serials.length > 0 && <div className="text-muted-foreground mt-0.5">Serials: <span className="font-mono">{l.serials[0]} … {l.serials[l.serials.length - 1]}</span> ({l.serials.length})</div>}</td>
                    <td className="p-2 font-mono">{l.hsn}</td><td className="p-2 text-right tabular-nums">{qty(l.qty)} {l.uom}</td><td className="p-2 text-right tabular-nums">{inr2(l.rate)}</td><td className="p-2 text-right tabular-nums">{inr2(l.taxable)}</td>
                    {intra ? <><td className="p-2 text-right tabular-nums">{inr2(l.cgst)}<div className="text-muted-foreground">{l.gstRate / 2}%</div></td><td className="p-2 text-right tabular-nums">{inr2(l.sgst)}<div className="text-muted-foreground">{l.gstRate / 2}%</div></td></> : <td className="p-2 text-right tabular-nums">{inr2(l.igst)}<div className="text-muted-foreground">{l.gstRate}%</div></td>}
                  </tr>))}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-6 items-end">
              <div className="text-xs max-w-sm space-y-2"><div><div className="text-muted-foreground">Amount in words</div><div className="font-medium" data-testid="text-amount-words">{amountInWords(inv.total)}</div></div>
                {cfg.certifications && <div className="text-[11px] text-muted-foreground">Certified: {cfg.certifications}</div>}</div>
              <div className="ml-auto w-64 text-sm space-y-1 tabular-nums">
                <div className="flex justify-between"><span className="text-muted-foreground">Taxable value</span><span>{inr2(inv.taxable)}</span></div>
                {intra ? <><div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{inr2(inv.cgst)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{inr2(inv.sgst)}</span></div></> : <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{inr2(inv.igst)}</span></div>}
                {inv.roundOff !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">Round off</span><span>{inr2(inv.roundOff)}</span></div>}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Invoice total</span><span data-testid="text-invoice-total">{inr2(inv.total)}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4 print:hidden">
        {cancelled ? <Card className="h-fit"><CardContent className="p-4 text-sm text-muted-foreground">This invoice is cancelled. Its number stays in the series and cannot be reused.</CardContent></Card> : <>
        <EDocPanel type="INV" id={inv.id} ewbRequired={inv.total > 50000 || inv.placeOfSupply !== cfg.stateCode} ewbHint={inv.total > 50000 ? "Consignment value above ₹50,000." : undefined}
          defaults={{ vehicleNo: inv.vehicleNo, transporter: inv.transporter, distanceKm: inv.distanceKm }} voidable={!e?.irn && !notes.some(n => n.status === "ACTIVE")} onVoid={() => setVoidOpen(true)} />
        {!e?.irn && <details className="rounded-md border bg-card px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Registered on the portal directly? Enter IRN manually</summary>
          <div className="space-y-2 pt-2">
            <div className="space-y-1"><Label className="text-xs">IRN (64-char hash)</Label><Input className="font-mono text-xs" value={f.irn} onChange={x => setF({ ...f, irn: x.target.value.trim() })} data-testid="input-irn" /></div>
            <div className="space-y-1"><Label className="text-xs">Ack no.</Label><Input className="font-mono text-xs" value={f.ackNo} onChange={x => setF({ ...f, ackNo: x.target.value.trim() })} data-testid="input-ack" /></div>
            <div className="space-y-1"><Label className="text-xs">E-way bill no.</Label><Input className="font-mono text-xs" value={f.ewbNo} onChange={x => setF({ ...f, ewbNo: x.target.value.trim() })} data-testid="input-ewb" /></div>
            <Button size="sm" className="w-full" disabled={save.isPending} onClick={() => save.mutate({ irn: f.irn || null, ackNo: f.ackNo || null, ewbNo: f.ewbNo || null })} data-testid="button-save-irn">Save</Button>
          </div>
        </details>}
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center">Credit / debit notes<Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setNoteOpen(true)} data-testid="button-invoice-new-note"><Plus className="h-3.5 w-3.5 mr-1" />New</Button></CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">{!notes.length ? <p className="text-xs text-muted-foreground">None issued against this invoice.</p> : notes.map(n => (
            <Link key={n.id} href={`/note/${n.id}`} className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted" data-testid={`link-invoice-note-${n.id}`}>
              <span className="font-mono text-xs">{n.noteNo}</span><span className="text-xs text-muted-foreground truncate">{n.reason}</span><span className="ml-auto text-xs tabular-nums">{inr2(n.total)}</span></Link>))}
          </CardContent>
        </Card></>}
        {pdis.length > 0 && <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pre-dispatch inspection</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">{pdis.map(p => (
            <Link key={p.id} href={`/pdi/${p.id}`} className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted" data-testid={`link-pdi-${p.id}`}>
              <span className="font-mono text-xs">{p.pdiNo}</span><span className="font-mono text-xs text-muted-foreground">{p.itemCode}</span><span className="text-xs tabular-nums">{p.qty} / sample {p.sample}</span><span className="ml-auto"><StatusBadge status={p.result} /></span></Link>))}
          </CardContent>
        </Card>}
        </div>
      </div>
      <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} invoiceId={inv.id} />
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cancel invoice {inv.invNo}?</DialogTitle>
            <DialogDescription>Goods and serial numbers go back to Finished Goods Stores, the sales order quantity reopens and linked PDI reports are released. The invoice number stays in the series as cancelled.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="destructive" disabled={voidInv.isPending} onClick={() => voidInv.mutate({}, { onSuccess: () => setVoidOpen(false) })} data-testid="button-confirm-void">Cancel invoice</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
