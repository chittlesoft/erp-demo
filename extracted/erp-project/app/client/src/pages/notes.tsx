import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, Plus, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATES } from "@shared/schema";
import { useAction, inr, inr2, qty, amountInWords, type Invoice } from "@/lib/erp";
import { StatusBadge, Empty } from "@/components/layout";
import { EDocPanel, IrnPrintBlock, useEDoc, useP4Meta } from "@/components/edoc";

export type NoteLine = { idx: number; itemId: number; code: string; name: string; hsn: string; uom: string; qty: number; rate: number; taxable: number; gstRate: number; cgst: number; sgst: number; igst: number; serials: string[] };
export type Note = {
  id: number; noteNo: string; typ: "CRN" | "DBN"; date: string; invoiceId: number; invNo: string; invDate: string; reason: string; kind: "RETURN" | "VALUE";
  customer: { id: number; name: string; gstin: string; stateCode: string; address: string; city: string; pincode: string };
  lines: NoteLine[]; taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; total: number; status: "ACTIVE" | "CANCELLED"; edoc: any;
};
type Headroom = { lines: { idx: number; code: string; name: string; hsn: string; uom: string; qty: number; rate: number; taxable: number; gstRate: number; creditable: number; returnable: number; serials: string[] }[]; crnDeadline: string };
const dmy = (d: string) => d.split("-").reverse().join("/");

export function NoteDialog({ open, onOpenChange, invoiceId }: { open: boolean; onOpenChange: (o: boolean) => void; invoiceId?: number }) {
  const meta = useP4Meta().data;
  const invs = (useQuery<Invoice[]>({ queryKey: ["/api/invoices"] }).data ?? []).filter(i => i.status !== "CANCELLED");
  const [invId, setInvId] = useState("");
  const [typ, setTyp] = useState<"CRN" | "DBN">("CRN");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Record<number, { qty: string; rate: string; serials: string[] }>>({});
  useEffect(() => { if (open) { setInvId(invoiceId ? String(invoiceId) : ""); setTyp("CRN"); setReason(""); setRows({}); } }, [open, invoiceId]);
  const head = useQuery<Headroom>({ queryKey: [`/api/invoices/${invId}/headroom`], enabled: !!invId }).data;
  const isReturn = typ === "CRN" && reason === "Sales return";
  useEffect(() => { if (head) setRows(Object.fromEntries(head.lines.map(l => [l.idx, { qty: "", rate: isReturn ? String(l.rate) : "", serials: [] }]))); }, [head, isReturn]);
  const save = useAction("POST", "/api/notes", typ === "CRN" ? "Credit note issued" : "Debit note issued");
  const reasons = typ === "CRN" ? meta?.crnReasons ?? [] : meta?.dbnReasons ?? [];
  const taxable = head?.lines.reduce((s, l) => s + (+rows[l.idx]?.qty || 0) * (+rows[l.idx]?.rate || 0), 0) ?? 0;
  const gst = head?.lines.reduce((s, l) => s + (+rows[l.idx]?.qty || 0) * (+rows[l.idx]?.rate || 0) * l.gstRate / 100, 0) ?? 0;
  const late = head && typ === "CRN" && new Date().toISOString().slice(0, 10) > head.crnDeadline;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New credit / debit note</DialogTitle>
          <DialogDescription>Issued against an original tax invoice (Sec. 34 CGST). A sales return brings the goods back into QC Quarantine; other reasons adjust value only.</DialogDescription></DialogHeader>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Type</Label>
            <Select value={typ} onValueChange={v => { setTyp(v as any); setReason(""); }}><SelectTrigger data-testid="select-note-type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="CRN">Credit note (reduce value)</SelectItem><SelectItem value="DBN">Debit note (increase value)</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Against invoice</Label>
            <Select value={invId} onValueChange={setInvId}><SelectTrigger data-testid="select-note-invoice"><SelectValue placeholder="Choose invoice" /></SelectTrigger>
              <SelectContent>{invs.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.invNo} · {inr(i.total)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}><SelectTrigger data-testid="select-note-reason"><SelectValue placeholder="Choose reason" /></SelectTrigger>
              <SelectContent>{reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {head && typ === "CRN" && <p className={`text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>Credit notes against this invoice must be issued by {dmy(head.crnDeadline)} (30 November after the financial year ends).</p>}
        {head && reason && <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-y bg-muted/40 text-muted-foreground"><th className="text-left font-medium p-2">Item</th><th className="text-right font-medium p-2">Invoiced</th><th className="text-right font-medium p-2">{isReturn ? "Returnable" : "Creditable"}</th><th className="text-right font-medium p-2 w-24">Qty</th><th className="text-right font-medium p-2 w-28">{isReturn ? "Rate" : "Rate / unit"}</th><th className="text-right font-medium p-2">Value</th></tr></thead>
            <tbody>{head.lines.map(l => { const r = rows[l.idx] ?? { qty: "", rate: "", serials: [] }; return (
              <tr key={l.idx} className="border-b align-top">
                <td className="p-2"><div className="font-mono">{l.code}</div><div className="text-muted-foreground">{l.name}</div>
                  {isReturn && l.serials.length > 0 && +r.qty > 0 && <div className="mt-1 max-h-28 overflow-y-auto grid grid-cols-2 gap-x-3 gap-y-0.5">{l.serials.map(s => (
                    <label key={s} className="flex items-center gap-1 font-mono text-[10px]"><Checkbox checked={r.serials.includes(s)} onCheckedChange={c => setRows({ ...rows, [l.idx]: { ...r, serials: c ? [...r.serials, s] : r.serials.filter(x => x !== s) } })} data-testid={`check-serial-${s}`} />{s}</label>))}
                    <div className="col-span-2 text-muted-foreground">{r.serials.length ? `${r.serials.length} picked` : `None picked — the last ${r.qty} will be used`}</div></div>}</td>
                <td className="p-2 text-right tabular-nums">{qty(l.qty)} × {inr2(l.rate)}</td>
                <td className="p-2 text-right tabular-nums">{isReturn ? `${l.returnable} ${l.uom}` : inr2(l.creditable)}</td>
                <td className="p-2"><Input className="h-8 text-right" inputMode="decimal" value={r.qty} onChange={e => setRows({ ...rows, [l.idx]: { ...r, qty: e.target.value.replace(/[^\d.]/g, "") } })} data-testid={`input-note-qty-${l.idx}`} /></td>
                <td className="p-2"><Input className="h-8 text-right" inputMode="decimal" disabled={isReturn} value={r.rate} onChange={e => setRows({ ...rows, [l.idx]: { ...r, rate: e.target.value.replace(/[^\d.]/g, "") } })} data-testid={`input-note-rate-${l.idx}`} /></td>
                <td className="p-2 text-right tabular-nums">{inr2((+r.qty || 0) * (+r.rate || 0))}</td>
              </tr>); })}</tbody>
          </table>
          <div className="text-right text-sm mt-2 tabular-nums">Taxable {inr2(taxable)} · GST {inr2(gst)} · <b>Total {inr(taxable + gst)}</b></div>
        </div>}
        <DialogFooter><Button disabled={save.isPending || !invId || !reason || !taxable}
          onClick={() => save.mutate({ typ, invoiceId: +invId, reason, lines: Object.entries(rows).map(([idx, r]) => ({ idx: +idx, qty: +r.qty || 0, rate: +r.rate || 0, serials: r.serials.length ? r.serials : undefined })) }, { onSuccess: () => onOpenChange(false) })}
          data-testid="button-save-note">Issue {typ === "CRN" ? "credit" : "debit"} note</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NotesTab() {
  const notes = useQuery<Note[]>({ queryKey: ["/api/notes"] });
  const [open, setOpen] = useState(false);
  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center gap-2 p-3 border-b"><p className="text-xs text-muted-foreground">Credit notes reduce, debit notes increase the value of an earlier invoice. Each needs its own IRN when e-invoicing applies.</p>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)} data-testid="button-new-note"><Plus className="h-4 w-4 mr-1" />New note</Button></div>
      {notes.isLoading ? <Skeleton className="h-32 m-3" /> : !notes.data?.length ? <Empty>No credit or debit notes yet.</Empty> :
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="text-left font-medium p-2">Note no.</th><th className="text-left font-medium p-2">Type</th><th className="text-left font-medium p-2">Date</th><th className="text-left font-medium p-2">Customer</th><th className="text-left font-medium p-2">Against</th><th className="text-left font-medium p-2">Reason</th><th className="text-right font-medium p-2">Total</th><th className="text-left font-medium p-2">E-invoice</th></tr></thead>
        <tbody>{notes.data.map(n => (
          <tr key={n.id} className="border-b hover:bg-muted/30">
            <td className="p-2"><Link href={`/note/${n.id}`} className="font-mono text-xs text-primary hover:underline" data-testid={`link-note-${n.id}`}>{n.noteNo}</Link></td>
            <td className="p-2"><StatusBadge status={n.typ} /></td><td className="p-2 text-xs tabular-nums">{dmy(n.date)}</td><td className="p-2 text-xs">{n.customer.name}</td>
            <td className="p-2"><Link href={`/invoice/${n.invoiceId}`} className="font-mono text-xs hover:underline">{n.invNo}</Link></td><td className="p-2 text-xs">{n.reason}</td>
            <td className="p-2 text-right tabular-nums">{inr2(n.total)}</td>
            <td className="p-2"><StatusBadge status={n.status === "CANCELLED" ? "CANCELLED" : n.edoc?.irnStatus === "ACT" ? "IRN_OK" : "IRN_PENDING"} /></td>
          </tr>))}</tbody></table></div>}
      <NoteDialog open={open} onOpenChange={setOpen} />
    </CardContent></Card>
  );
}

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Note & { company: any }>({ queryKey: [`/api/notes/${id}`] });
  const e = useEDoc(q.data?.typ ?? "CRN", id).data ?? null;
  const n = q.data;
  if (!n) return <Skeleton className="h-96" />;
  const cfg = n.company, intra = !n.igst;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Link href="/sales"><Button variant="ghost" size="sm" data-testid="button-back"><ArrowLeft className="h-4 w-4 mr-1" />Sales</Button></Link>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.print()} data-testid="button-print"><Printer className="h-4 w-4 mr-1" />Print</Button>
      </div>
      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Card className="print:shadow-none print:border-0 relative overflow-hidden">
          {n.status === "CANCELLED" && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-6xl font-bold text-destructive/15 -rotate-12">CANCELLED</span></div>}
          <CardContent className="p-6 space-y-5 text-sm">
            <div className="flex flex-wrap items-start gap-4 border-b pb-4">
              <div><div className="text-base font-semibold">{cfg.legalName}</div><div className="text-xs text-muted-foreground">{cfg.address}, {cfg.city} {cfg.pincode}</div><div className="text-xs font-mono mt-1">GSTIN {cfg.gstin} · State {cfg.stateCode} {STATES[cfg.stateCode]}</div></div>
              <div className="ml-auto text-right"><div className="text-xs uppercase tracking-wider text-muted-foreground">{n.typ === "CRN" ? "Credit Note" : "Debit Note"}</div><div className="font-mono font-semibold" data-testid="text-note-no">{n.noteNo}</div><div className="text-xs tabular-nums">{dmy(n.date)}</div></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><div className="text-xs text-muted-foreground mb-1">Recipient</div><div className="font-medium">{n.customer.name}</div><div className="text-xs text-muted-foreground">{n.customer.address}, {n.customer.city} {n.customer.pincode}</div><div className="text-xs font-mono mt-1">GSTIN {n.customer.gstin}</div></div>
              <div className="text-xs space-y-0.5 sm:text-right"><div>Original invoice <span className="font-mono">{n.invNo}</span> dated {dmy(n.invDate)}</div><div>Reason: <b>{n.reason}</b></div><div>Place of supply: {n.customer.stateCode} · {STATES[n.customer.stateCode]}</div></div>
            </div>
            <IrnPrintBlock e={e} />
            <table className="w-full text-xs">
              <thead><tr className="border-y bg-muted/40 text-muted-foreground"><th className="text-left font-medium p-2">Description</th><th className="text-left font-medium p-2">HSN</th><th className="text-right font-medium p-2">Qty</th><th className="text-right font-medium p-2">Rate</th><th className="text-right font-medium p-2">Taxable</th>{intra ? <><th className="text-right font-medium p-2">CGST</th><th className="text-right font-medium p-2">SGST</th></> : <th className="text-right font-medium p-2">IGST</th>}</tr></thead>
              <tbody>{n.lines.map((l, i) => (
                <tr key={i} className="border-b align-top"><td className="p-2"><div className="font-medium">{l.name}</div><div className="text-muted-foreground">Tau No - {l.code}</div>{l.serials.length > 0 && <div className="text-muted-foreground font-mono text-[10px]">Returned: {l.serials.join(", ")}</div>}</td>
                  <td className="p-2 font-mono">{l.hsn}</td><td className="p-2 text-right tabular-nums">{qty(l.qty)} {l.uom}</td><td className="p-2 text-right tabular-nums">{inr2(l.rate)}</td><td className="p-2 text-right tabular-nums">{inr2(l.taxable)}</td>
                  {intra ? <><td className="p-2 text-right tabular-nums">{inr2(l.cgst)}</td><td className="p-2 text-right tabular-nums">{inr2(l.sgst)}</td></> : <td className="p-2 text-right tabular-nums">{inr2(l.igst)}</td>}</tr>))}</tbody>
            </table>
            <div className="flex flex-wrap gap-6 items-end">
              <div className="text-xs"><div className="text-muted-foreground">Amount in words</div><div className="font-medium">{amountInWords(n.total)}</div></div>
              <div className="ml-auto w-64 text-sm space-y-1 tabular-nums">
                <div className="flex justify-between"><span className="text-muted-foreground">Taxable value</span><span>{inr2(n.taxable)}</span></div>
                {intra ? <><div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{inr2(n.cgst)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{inr2(n.sgst)}</span></div></> : <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{inr2(n.igst)}</span></div>}
                {n.roundOff !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">Round off</span><span>{inr2(n.roundOff)}</span></div>}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Note total</span><span data-testid="text-note-total">{inr2(n.total)}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="print:hidden">{n.status === "ACTIVE" ? <EDocPanel type={n.typ} id={n.id} ewbRequired={false} defaults={{ vehicleNo: null, transporter: null, distanceKm: 0 }} /> :
          <Card><CardContent className="p-4 text-sm text-muted-foreground">This note is cancelled.</CardContent></Card>}</div>
      </div>
    </div>
  );
}
