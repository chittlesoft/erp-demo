import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, Download, PackageCheck, Plus, Printer, Trash2, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATES } from "@shared/schema";
import { API_BASE } from "@/lib/queryClient";
import { useItems, useParties, useSettings, useAction, inr, inr2, qty, amountInWords } from "@/lib/erp";
import { PageIntro, StatusBadge, Empty } from "@/components/layout";
import { EDocPanel, IrnPrintBlock, useEDoc, useP4Meta } from "@/components/edoc";

type Kind = "INPUT" | "CAPITAL" | "TOOL";
export type ChLine = { id: number; itemId: number | null; code: string; description: string; hsn: string; uom: string; qty: number; rate: number; value: number; kind: Kind; batchNo: string | null; gstRate: number;
  receivedQty: number; lossQty: number; deemedQty: number; pending: number; due: string | null; daysLeft: number | null; overdue: boolean };
export type Challan = { id: number; challanNo: string; date: string; process: string; expectedReturn: string | null; vehicleNo: string | null; transporter: string | null; distanceKm: number; note: string;
  jobworker: { id: number; name: string; gstin: string; stateCode: string; address: string; city: string; pincode: string }; lines: ChLine[]; value: number; interstate: boolean; ewbRequired: boolean;
  ewb: { no: string; dt: string; validTill: string; status: string } | null; status: "OPEN" | "PARTIAL" | "CLOSED" | "OVERDUE"; daysLeft: number | null;
  receipts: { id: number; recNo: string; date: string; jwChallanNo: string; jwChallanDate: string; lines: { lineId: number; qty: number; lossQty: number }[] }[] };
type JwReturn = { id: number; retNo: string; invNo: string; date: string; receiptId: number; lines: { idx: number; qty: number; scrapQty: number }[]; sac: string; chargeRate: number; gstRate: number; taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; total: number; vehicleNo: string | null; status: string };
type Inward = { id: number; recNo: string; date: string; principal: { id: number; name: string; gstin: string; stateCode: string }; principalChallanNo: string; principalChallanDate: string; process: string; chargeRate: number;
  lines: { idx: number; description: string; hsn: string; uom: string; qty: number; value: number; returned: number; scrap: number; pending: number }[]; daysHeld: number; status: string; returns: JwReturn[] };
type Itc04 = { fy: string; period: { key: string; label: string; from: string; to: string; due: string }; periods: { key: string; label: string; due: string }[]; half: boolean; daysToDue: number;
  table4: { jwGstin: string; jwState: string; jw: string; challanNo: string; challanDate: string; kind: string; description: string; hsn: string; uqc: string; qty: number; taxable: number; gstRate: number }[];
  table5A: { jwGstin: string; jw: string; origChallanNo: string; origChallanDate: string; jwChallanNo: string; jwChallanDate: string; description: string; uqc: string; qty: number; lossQty: number; receivedOn: string }[] };
const dmy = (d: string | null) => d ? d.split("-").reverse().join("/") : "-";
const today = () => new Date().toISOString().slice(0, 10);
const KIND_SHORT: Record<Kind, string> = { INPUT: "Input", CAPITAL: "Capital goods", TOOL: "Tool / die" };

function DaysLeft({ d, status }: { d: number | null; status?: string }) {
  if (status === "CLOSED") return <span className="text-muted-foreground text-xs">-</span>;
  if (d == null) return <span className="text-xs text-muted-foreground">No limit (tools)</span>;
  if (d < 0) return <span className="text-xs font-medium text-destructive">{-d} days overdue</span>;
  return <span className={`text-xs tabular-nums ${d <= 30 ? "text-[hsl(var(--chart-2))] font-medium" : ""}`}>{d} days left</span>;
}

// ---------------- outward: new challan ----------------
type NL = { mode: "stock" | "other"; itemId: string; description: string; hsn: string; uom: string; qty: string; rate: string; kind: Kind };
const blank = (): NL => ({ mode: "stock", itemId: "", description: "", hsn: "", uom: "NOS", qty: "", rate: "", kind: "INPUT" });
function NewChallanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const jws = useParties("JOBWORKER").data ?? [];
  const items = (useItems().data ?? []).filter(i => i.type === "RM" || i.type === "SFG");
  const cfg = useSettings().data;
  const [f, setF] = useState({ jobworkerId: "", process: "", expectedReturn: "", vehicleNo: "", transporter: "", distanceKm: "" });
  const [lines, setLines] = useState<NL[]>([blank()]);
  useEffect(() => { if (open) { setF({ jobworkerId: "", process: "", expectedReturn: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), vehicleNo: "", transporter: "", distanceKm: "" }); setLines([blank()]); } }, [open]);
  const save = useAction("POST", "/api/jw/challans", "Job work challan issued");
  const jw = jws.find(j => String(j.id) === f.jobworkerId);
  const upd = (i: number, p: Partial<NL>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...p } : l));
  const value = lines.reduce((s, l) => { const it = items.find(x => String(x.id) === l.itemId); return s + (+l.qty || 0) * (l.mode === "stock" ? (it?.stdCost || it?.rolledCost || 0) : +l.rate || 0); }, 0);
  const interstate = jw && cfg && jw.stateCode !== cfg.stateCode;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Send goods for job work</DialogTitle>
          <DialogDescription>Delivery challan under Rule 45 — no GST is charged. Inputs must come back within 1 year and capital goods within 3 years, or they are treated as supplied on the date sent.</DialogDescription></DialogHeader>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Job worker</Label>
            <Select value={f.jobworkerId} onValueChange={v => { const j = jws.find(x => String(x.id) === v); setF({ ...f, jobworkerId: v, distanceKm: String(j?.distanceKm ?? "") }); }}><SelectTrigger data-testid="select-jobworker"><SelectValue placeholder="Choose job worker" /></SelectTrigger>
              <SelectContent>{jws.map(j => <SelectItem key={j.id} value={String(j.id)}>{j.name} · {j.city}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 sm:col-span-2"><Label>Process</Label><Input value={f.process} onChange={e => setF({ ...f, process: e.target.value })} placeholder="e.g. Electroless nickel plating" data-testid="input-process" /></div>
          <div className="space-y-1"><Label>Expected back by</Label><Input type="date" value={f.expectedReturn} onChange={e => setF({ ...f, expectedReturn: e.target.value })} data-testid="input-expected-return" /></div>
          <div className="space-y-1"><Label>Vehicle no.</Label><Input className="font-mono" value={f.vehicleNo} onChange={e => setF({ ...f, vehicleNo: e.target.value.toUpperCase() })} placeholder="MH12AB1234" data-testid="input-jw-vehicle" /></div>
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Transporter</Label><Input value={f.transporter} onChange={e => setF({ ...f, transporter: e.target.value })} data-testid="input-jw-transporter" /></div>
            <div className="space-y-1"><Label>Distance km</Label><Input inputMode="numeric" value={f.distanceKm} onChange={e => setF({ ...f, distanceKm: e.target.value.replace(/\D/g, "") })} data-testid="input-jw-distance" /></div></div>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => { const it = items.find(x => String(x.id) === l.itemId); return (
            <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-md border p-2">
              <div className="col-span-6 sm:col-span-2 space-y-1"><Label className="text-xs">Line type</Label>
                <Select value={l.mode} onValueChange={v => upd(i, { mode: v as any, kind: v === "stock" ? "INPUT" : "TOOL" })}><SelectTrigger className="h-9" data-testid={`select-line-mode-${i}`}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="stock">Stock item</SelectItem><SelectItem value="other">Tool / capital goods</SelectItem></SelectContent></Select></div>
              {l.mode === "stock" ? <>
                <div className="col-span-6 sm:col-span-5 space-y-1"><Label className="text-xs">Item (from Raw Material Stores)</Label>
                  <Select value={l.itemId} onValueChange={v => upd(i, { itemId: v })}><SelectTrigger className="h-9" data-testid={`select-jw-item-${i}`}><SelectValue placeholder="Choose item" /></SelectTrigger>
                    <SelectContent>{items.map(x => <SelectItem key={x.id} value={String(x.id)}>{x.code} — {x.name} ({qty(x.onHand)})</SelectItem>)}</SelectContent></Select></div>
                <div className="col-span-4 sm:col-span-2 space-y-1"><Label className="text-xs">Qty {it && <span className="text-muted-foreground">{it.uom}</span>}</Label><Input className="h-9" inputMode="decimal" value={l.qty} onChange={e => upd(i, { qty: e.target.value.replace(/[^\d.]/g, "") })} data-testid={`input-jw-qty-${i}`} /></div>
                <div className="col-span-6 sm:col-span-2 text-xs text-muted-foreground pb-2 tabular-nums">{it ? `${inr2(it.stdCost || it.rolledCost)} / unit` : ""}</div>
              </> : <>
                <div className="col-span-6 sm:col-span-3 space-y-1"><Label className="text-xs">Description</Label><Input className="h-9" value={l.description} onChange={e => upd(i, { description: e.target.value })} data-testid={`input-jw-desc-${i}`} /></div>
                <div className="col-span-3 sm:col-span-1 space-y-1"><Label className="text-xs">HSN</Label><Input className="h-9 font-mono" value={l.hsn} onChange={e => upd(i, { hsn: e.target.value.replace(/\D/g, "") })} data-testid={`input-jw-hsn-${i}`} /></div>
                <div className="col-span-3 sm:col-span-1 space-y-1"><Label className="text-xs">Qty</Label><Input className="h-9" inputMode="decimal" value={l.qty} onChange={e => upd(i, { qty: e.target.value.replace(/[^\d.]/g, "") })} data-testid={`input-jw-qty-${i}`} /></div>
                <div className="col-span-3 sm:col-span-2 space-y-1"><Label className="text-xs">Value / unit</Label><Input className="h-9" inputMode="decimal" value={l.rate} onChange={e => upd(i, { rate: e.target.value.replace(/[^\d.]/g, "") })} data-testid={`input-jw-rate-${i}`} /></div>
                <div className="col-span-3 sm:col-span-2 space-y-1"><Label className="text-xs">Goods type</Label>
                  <Select value={l.kind} onValueChange={v => upd(i, { kind: v as Kind })}><SelectTrigger className="h-9" data-testid={`select-jw-kind-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="TOOL">Mould / die / jig / tool</SelectItem><SelectItem value="CAPITAL">Capital goods (3 yr)</SelectItem></SelectContent></Select></div>
              </>}
              <div className="col-span-2 sm:col-span-1 flex justify-end"><Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} aria-label="Remove line" data-testid={`button-remove-jw-line-${i}`}><Trash2 className="h-4 w-4" /></Button></div>
            </div>); })}
          <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, blank()])} data-testid="button-add-jw-line"><Plus className="h-4 w-4 mr-1" />Add line</Button>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
          <span>Challan value <b className="tabular-nums">{inr(value)}</b></span>
          {jw && <span className={interstate || value > 50000 ? "text-[hsl(var(--chart-2))] font-medium" : "text-muted-foreground"}>{interstate ? "Inter-state job work: e-way bill required regardless of value" : value > 50000 ? "E-way bill required (> ₹50,000)" : "E-way bill not required"}</span>}
        </div>
        <DialogFooter><Button disabled={save.isPending || !f.jobworkerId || !f.process} data-testid="button-save-challan"
          onClick={() => save.mutate({ jobworkerId: +f.jobworkerId, process: f.process, expectedReturn: f.expectedReturn || null, vehicleNo: f.vehicleNo || null, transporter: f.transporter || null, distanceKm: +f.distanceKm || null,
            lines: lines.filter(l => +l.qty > 0).map(l => l.mode === "stock" ? { itemId: +l.itemId, qty: +l.qty, kind: "INPUT" } : { itemId: null, description: l.description, hsn: l.hsn, uom: "NOS", qty: +l.qty, rate: +l.rate, kind: l.kind }) }, { onSuccess: () => onOpenChange(false) })}>Issue challan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ ch, onClose }: { ch: Challan | null; onClose: () => void }) {
  const [f, setF] = useState({ jwChallanNo: "", jwChallanDate: today() });
  const [rows, setRows] = useState<Record<number, { qty: string; loss: string }>>({});
  useEffect(() => { if (ch) { setF({ jwChallanNo: "", jwChallanDate: today() }); setRows(Object.fromEntries(ch.lines.map(l => [l.id, { qty: l.pending > 0 ? String(l.pending) : "", loss: "" }]))); } }, [ch?.id]);
  const save = useAction("POST", `/api/jw/challans/${ch?.id}/receive`, "Goods received back from job worker");
  if (!ch) return null;
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Receive back — {ch.challanNo}</DialogTitle><DialogDescription>{ch.jobworker.name} · {ch.process}. Processed goods return to Raw Material Stores; losses are written off at the job worker.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Job worker's challan no.</Label><Input value={f.jwChallanNo} onChange={e => setF({ ...f, jwChallanNo: e.target.value.toUpperCase() })} data-testid="input-jw-challan-no" /></div>
          <div className="space-y-1"><Label>Their challan date</Label><Input type="date" value={f.jwChallanDate} onChange={e => setF({ ...f, jwChallanDate: e.target.value })} data-testid="input-jw-challan-date" /></div>
        </div>
        <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium py-1">Goods</th><th className="text-right font-medium">Pending</th><th className="text-left font-medium pl-3">Received</th><th className="text-left font-medium pl-3">Loss / waste</th></tr></thead>
          <tbody>{ch.lines.filter(l => l.pending > 0).map(l => (
            <tr key={l.id} className="border-t"><td className="py-2 text-xs"><div className="font-medium">{l.description}</div><div className="text-muted-foreground font-mono">{l.batchNo ?? KIND_SHORT[l.kind]}</div></td>
              <td className="text-right tabular-nums">{qty(l.pending)} {l.uom}</td>
              <td className="pl-3 w-28"><Input className="h-8" inputMode="decimal" value={rows[l.id]?.qty ?? ""} onChange={e => setRows({ ...rows, [l.id]: { ...rows[l.id], qty: e.target.value.replace(/[^\d.]/g, "") } })} data-testid={`input-receive-qty-${l.id}`} /></td>
              <td className="pl-3 w-28"><Input className="h-8" inputMode="decimal" value={rows[l.id]?.loss ?? ""} onChange={e => setRows({ ...rows, [l.id]: { ...rows[l.id], loss: e.target.value.replace(/[^\d.]/g, "") } })} data-testid={`input-receive-loss-${l.id}`} /></td></tr>))}</tbody></table>
        <DialogFooter><Button disabled={save.isPending || !f.jwChallanNo} data-testid="button-save-receive"
          onClick={() => save.mutate({ jwChallanNo: f.jwChallanNo, jwChallanDate: f.jwChallanDate, lines: Object.entries(rows).map(([id, r]) => ({ lineId: +id, qty: +r.qty || 0, lossQty: +r.loss || 0 })) }, { onSuccess: onClose })}>Record receipt</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- inward ----------------
function NewInwardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const customers = useParties("CUSTOMER").data ?? [];
  const [f, setF] = useState({ principalId: "", principalChallanNo: "", principalChallanDate: today(), process: "", chargeRate: "" });
  const [l, setL] = useState({ description: "", hsn: "", qty: "", value: "" });
  useEffect(() => { if (open) { setF({ principalId: "", principalChallanNo: "", principalChallanDate: today(), process: "", chargeRate: "" }); setL({ description: "", hsn: "", qty: "", value: "" }); } }, [open]);
  const save = useAction("POST", "/api/jw/inward", "Customer goods received for job work");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Receive customer goods for job work</DialogTitle><DialogDescription>Goods stay the customer's property and are kept out of Tau Power stock. Record their challan exactly as received.</DialogDescription></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Principal (customer)</Label>
            <Select value={f.principalId} onValueChange={v => setF({ ...f, principalId: v })}><SelectTrigger data-testid="select-principal"><SelectValue placeholder="Choose customer" /></SelectTrigger>
              <SelectContent>{customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Process to perform</Label><Input value={f.process} onChange={e => setF({ ...f, process: e.target.value })} placeholder="e.g. Calibration & EOL testing" data-testid="input-inward-process" /></div>
          <div className="space-y-1"><Label>Their challan no.</Label><Input value={f.principalChallanNo} onChange={e => setF({ ...f, principalChallanNo: e.target.value.toUpperCase() })} data-testid="input-principal-challan" /></div>
          <div className="space-y-1"><Label>Their challan date</Label><Input type="date" value={f.principalChallanDate} onChange={e => setF({ ...f, principalChallanDate: e.target.value })} data-testid="input-principal-challan-date" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Goods description</Label><Input value={l.description} onChange={e => setL({ ...l, description: e.target.value })} data-testid="input-inward-desc" /></div>
          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            <div className="space-y-1"><Label>HSN</Label><Input className="font-mono" value={l.hsn} onChange={e => setL({ ...l, hsn: e.target.value.replace(/\D/g, "") })} data-testid="input-inward-hsn" /></div>
            <div className="space-y-1"><Label>Qty (NOS)</Label><Input inputMode="decimal" value={l.qty} onChange={e => setL({ ...l, qty: e.target.value.replace(/[^\d.]/g, "") })} data-testid="input-inward-qty" /></div>
            <div className="space-y-1"><Label>Value / unit (their challan)</Label><Input inputMode="decimal" value={l.value} onChange={e => setL({ ...l, value: e.target.value.replace(/[^\d.]/g, "") })} data-testid="input-inward-value" /></div>
          </div>
          <div className="space-y-1"><Label>Agreed job work charge / unit</Label><Input inputMode="decimal" value={f.chargeRate} onChange={e => setF({ ...f, chargeRate: e.target.value.replace(/[^\d.]/g, "") })} data-testid="input-inward-charge" /></div>
        </div>
        <DialogFooter><Button disabled={save.isPending || !f.principalId || !l.description || !+l.qty} data-testid="button-save-inward"
          onClick={() => save.mutate({ ...f, principalId: +f.principalId, chargeRate: +f.chargeRate || 0, lines: [{ description: l.description, hsn: l.hsn, uom: "NOS", qty: +l.qty, value: +l.value || 0 }] }, { onSuccess: () => onOpenChange(false) })}>Record receipt</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ rec, onClose }: { rec: Inward | null; onClose: () => void }) {
  const [f, setF] = useState({ sac: "998874", chargeRate: "", gstRate: "18", vehicleNo: "" });
  const [rows, setRows] = useState<Record<number, { qty: string; scrap: string }>>({});
  useEffect(() => { if (rec) { setF({ sac: "998874", chargeRate: String(rec.chargeRate || ""), gstRate: "18", vehicleNo: "" }); setRows(Object.fromEntries(rec.lines.map(l => [l.idx, { qty: "", scrap: "" }]))); } }, [rec?.id]);
  const save = useAction("POST", `/api/jw/inward/${rec?.id}/return`, "Goods returned — job work invoice created");
  if (!rec) return null;
  const billed = Object.values(rows).reduce((s, r) => s + (+r.qty || 0), 0) * (+f.chargeRate || 0);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Return processed goods — {rec.recNo}</DialogTitle><DialogDescription>{rec.principal.name} · their challan {rec.principalChallanNo}. Creates a return delivery challan and a tax invoice for job work charges.</DialogDescription></DialogHeader>
        <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium py-1">Goods</th><th className="text-right font-medium">Pending</th><th className="text-left font-medium pl-3">Returning</th><th className="text-left font-medium pl-3">Scrap (not billed)</th></tr></thead>
          <tbody>{rec.lines.filter(l => l.pending > 0).map(l => (
            <tr key={l.idx} className="border-t"><td className="py-2 text-xs">{l.description}</td><td className="text-right tabular-nums">{qty(l.pending)}</td>
              <td className="pl-3 w-28"><Input className="h-8" inputMode="decimal" value={rows[l.idx]?.qty ?? ""} onChange={e => setRows({ ...rows, [l.idx]: { ...rows[l.idx], qty: e.target.value.replace(/[^\d.]/g, "") } })} data-testid={`input-return-qty-${l.idx}`} /></td>
              <td className="pl-3 w-28"><Input className="h-8" inputMode="decimal" value={rows[l.idx]?.scrap ?? ""} onChange={e => setRows({ ...rows, [l.idx]: { ...rows[l.idx], scrap: e.target.value.replace(/[^\d.]/g, "") } })} data-testid={`input-return-scrap-${l.idx}`} /></td></tr>))}</tbody></table>
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1"><Label>SAC</Label><Input className="font-mono" value={f.sac} onChange={e => setF({ ...f, sac: e.target.value.replace(/\D/g, "") })} data-testid="input-return-sac" /></div>
          <div className="space-y-1"><Label>Charge / unit</Label><Input inputMode="decimal" value={f.chargeRate} onChange={e => setF({ ...f, chargeRate: e.target.value.replace(/[^\d.]/g, "") })} data-testid="input-return-rate" /></div>
          <div className="space-y-1"><Label>GST %</Label><Input inputMode="decimal" value={f.gstRate} onChange={e => setF({ ...f, gstRate: e.target.value.replace(/[^\d.]/g, "") })} data-testid="input-return-gst" /></div>
          <div className="space-y-1"><Label>Vehicle no.</Label><Input className="font-mono" value={f.vehicleNo} onChange={e => setF({ ...f, vehicleNo: e.target.value.toUpperCase() })} data-testid="input-return-vehicle" /></div>
        </div>
        <p className="text-[11px] text-muted-foreground">SAC 998874 = computer, electronic & optical product manufacturing services (heading 9988). Confirm the code and rate with your tax consultant.</p>
        <div className="rounded-md bg-muted/50 p-3 text-sm">Job work charges <b className="tabular-nums">{inr2(billed)}</b> + GST {f.gstRate}% = <b className="tabular-nums">{inr(billed * (1 + (+f.gstRate || 0) / 100))}</b></div>
        <DialogFooter><Button disabled={save.isPending || !billed} data-testid="button-save-return"
          onClick={() => save.mutate({ sac: f.sac, chargeRate: +f.chargeRate, gstRate: +f.gstRate, vehicleNo: f.vehicleNo || null, lines: Object.entries(rows).map(([idx, r]) => ({ idx: +idx, qty: +r.qty || 0, scrapQty: +r.scrap || 0 })) }, { onSuccess: onClose })}>Return & invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- ITC-04 ----------------
function Itc04Tab() {
  const [fy, setFy] = useState("26-27");
  const [period, setPeriod] = useState("H1");
  const d = useQuery<Itc04>({ queryKey: [`/api/jw/itc04?fy=${fy}&period=${period}`] }).data;
  useEffect(() => { if (d && !d.periods.some(p => p.key === period)) setPeriod(d.periods[0].key); }, [d?.half]);
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">Financial year</Label>
          <Select value={fy} onValueChange={setFy}><SelectTrigger className="w-32" data-testid="select-itc-fy"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25-26">2025-26</SelectItem><SelectItem value="26-27">2026-27</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Return period</Label>
          <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-48" data-testid="select-itc-period"><SelectValue /></SelectTrigger><SelectContent>{(d?.periods ?? []).map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent></Select></div>
        {d && <div className="text-sm"><div className="text-xs text-muted-foreground">Due date</div><div className="font-medium tabular-nums" data-testid="text-itc-due">{dmy(d.period.due)} <span className={d.daysToDue < 0 ? "text-muted-foreground" : d.daysToDue <= 15 ? "text-destructive" : "text-muted-foreground"}>({d.daysToDue < 0 ? "past" : `${d.daysToDue} days`})</span></div></div>}
        <div className="sm:ml-auto flex gap-2">
          <a href={`${API_BASE}/api/jw/itc04.csv?fy=${fy}&period=${period}&table=4`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" data-testid="button-itc-csv-4"><Download className="h-4 w-4 mr-1" />Table 4 CSV</Button></a>
          <a href={`${API_BASE}/api/jw/itc04.csv?fy=${fy}&period=${period}&table=5A`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" data-testid="button-itc-csv-5a"><Download className="h-4 w-4 mr-1" />Table 5A CSV</Button></a>
        </div>
        <p className="w-full text-[11px] text-muted-foreground">{d?.half ? "Half-yearly return (turnover above ₹5 Cr): 25 October and 25 April." : "Annual return (turnover up to ₹5 Cr): 25 April."} Change the turnover band in Tally & Company. Columns follow the GSTN ITC-04 offline tool; paste into the tool to generate the JSON.</p>
      </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Table 4 — goods sent to job workers</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">{!d ? <Skeleton className="h-24 m-3" /> : !d.table4.length ? <Empty>Nothing sent in this period.</Empty> :
          <table className="w-full text-xs"><thead><tr className="border-y bg-muted/40 text-muted-foreground"><th className="text-left font-medium p-2">Job worker GSTIN</th><th className="text-left font-medium p-2">Challan</th><th className="text-left font-medium p-2">Date</th><th className="text-left font-medium p-2">Type</th><th className="text-left font-medium p-2">Description</th><th className="text-left font-medium p-2">HSN</th><th className="text-right font-medium p-2">Qty</th><th className="text-right font-medium p-2">Taxable value</th><th className="text-right font-medium p-2">GST rate</th></tr></thead>
            <tbody>{d.table4.map((r, i) => <tr key={i} className="border-b"><td className="p-2 font-mono">{r.jwGstin}<div className="font-sans text-muted-foreground">{r.jw}</div></td><td className="p-2 font-mono">{r.challanNo}</td><td className="p-2 tabular-nums">{dmy(r.challanDate)}</td><td className="p-2">{r.kind}</td><td className="p-2">{r.description}</td><td className="p-2 font-mono">{r.hsn}</td><td className="p-2 text-right tabular-nums">{qty(r.qty)} {r.uqc}</td><td className="p-2 text-right tabular-nums">{inr2(r.taxable)}</td><td className="p-2 text-right">{r.gstRate}%</td></tr>)}</tbody></table>}
        </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Table 5A — goods received back</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">{!d ? <Skeleton className="h-24 m-3" /> : !d.table5A.length ? <Empty>Nothing received back in this period.</Empty> :
          <table className="w-full text-xs"><thead><tr className="border-y bg-muted/40 text-muted-foreground"><th className="text-left font-medium p-2">Job worker GSTIN</th><th className="text-left font-medium p-2">Original challan</th><th className="text-left font-medium p-2">Job worker challan</th><th className="text-left font-medium p-2">Description</th><th className="text-right font-medium p-2">Qty received</th><th className="text-right font-medium p-2">Loss / waste</th></tr></thead>
            <tbody>{d.table5A.map((r, i) => <tr key={i} className="border-b"><td className="p-2 font-mono">{r.jwGstin}<div className="font-sans text-muted-foreground">{r.jw}</div></td><td className="p-2"><span className="font-mono">{r.origChallanNo}</span> · {dmy(r.origChallanDate)}</td><td className="p-2"><span className="font-mono">{r.jwChallanNo}</span> · {dmy(r.jwChallanDate)}</td><td className="p-2">{r.description}</td><td className="p-2 text-right tabular-nums">{qty(r.qty)} {r.uqc}</td><td className="p-2 text-right tabular-nums">{r.lossQty ? qty(r.lossQty) : "-"}</td></tr>)}</tbody></table>}
        </CardContent></Card>
      <p className="text-xs text-muted-foreground">Tables 5B (sent on to another job worker) and 5C (supplied directly from the job worker's premises) are not used — every challan returns to the Hinjawadi plant.</p>
    </div>
  );
}

export default function JobWorkPage() {
  const ch = useQuery<Challan[]>({ queryKey: ["/api/jw/challans"] });
  const inward = useQuery<Inward[]>({ queryKey: ["/api/jw/inward"] }).data ?? [];
  const [newOpen, setNewOpen] = useState(false);
  const [inOpen, setInOpen] = useState(false);
  const [recv, setRecv] = useState<Challan | null>(null);
  const [ret, setRet] = useState<Inward | null>(null);
  const rows = ch.data ?? [];
  const open = rows.filter(c => c.status !== "CLOSED");
  const atJw = open.reduce((s, c) => s + c.lines.reduce((a, l) => a + l.pending * l.rate, 0), 0);
  const due30 = rows.filter(c => c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= 30).length;
  const overdue = rows.filter(c => c.status === "OVERDUE").length;
  return (
    <>
      <PageIntro actions={<><Button variant="outline" onClick={() => setInOpen(true)} data-testid="button-new-inward"><PackageCheck className="h-4 w-4 mr-1" />Receive customer goods</Button><Button onClick={() => setNewOpen(true)} data-testid="button-new-challan"><Plus className="h-4 w-4 mr-1" />Send for job work</Button></>}>
        Goods sent to job workers on delivery challans (Sec. 143 CGST), their return deadlines and ITC-04; plus customer-owned goods Tau Power processes as a job worker, billed under SAC 9988.
      </PageIntro>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[["Value at job workers", inr(atJw), "kpi-jw-value"], ["Open challans", String(open.length), "kpi-jw-open"], ["Due within 30 days", String(due30), "kpi-jw-due"], ["Past the time limit", String(overdue), "kpi-jw-overdue"]].map(([l, v, t]) => (
          <Card key={t}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={`text-xl font-semibold tabular-nums mt-1 ${t === "kpi-jw-overdue" && overdue ? "text-destructive" : ""}`} data-testid={t}>{v}</div></CardContent></Card>))}
      </div>
      <Tabs defaultValue="out">
        <TabsList><TabsTrigger value="out" data-testid="tab-jw-out">Sent to job workers</TabsTrigger><TabsTrigger value="in" data-testid="tab-jw-in">Received for job work</TabsTrigger><TabsTrigger value="itc" data-testid="tab-jw-itc">ITC-04</TabsTrigger></TabsList>
        <TabsContent value="out">
          <Card><CardContent className="p-0 overflow-x-auto">{ch.isLoading ? <Skeleton className="h-40 m-3" /> : !rows.length ? <Empty>No job work challans yet.</Empty> :
            <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Challan</th><th className="text-left font-medium px-3">Job worker</th><th className="text-left font-medium px-3">Goods (pending / sent)</th><th className="text-right font-medium px-3">Value</th><th className="text-left font-medium px-3">Return deadline</th><th className="text-left font-medium px-3">E-way bill</th><th className="text-left font-medium px-3">Status</th><th className="px-3" /></tr></thead>
              <tbody>{rows.map(c => (
                <tr key={c.id} className="border-b last:border-0 align-top" data-testid={`row-challan-${c.id}`}>
                  <td className="px-4 py-2"><Link href={`/challan/${c.id}`} className="font-mono text-xs text-primary hover:underline" data-testid={`link-challan-${c.id}`}>{c.challanNo}</Link><div className="text-[11px] text-muted-foreground tabular-nums">{dmy(c.date)}</div></td>
                  <td className="px-3 py-2">{c.jobworker.name}<div className="text-[11px] text-muted-foreground">{c.process}{c.interstate && <span className="ml-1 rounded bg-secondary px-1">inter-state</span>}</div></td>
                  <td className="px-3 py-2 text-xs space-y-0.5">{c.lines.map(l => <div key={l.id}>{l.code ? <span className="font-mono">{l.code}</span> : l.description} <span className="tabular-nums text-muted-foreground">{qty(l.pending)} / {qty(l.qty)} {l.uom}</span></div>)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{inr(c.value)}</td>
                  <td className="px-3 py-2"><DaysLeft d={c.daysLeft} status={c.status} /></td>
                  <td className="px-3 py-2 text-xs">{c.ewb?.status === "ACT" ? <span className="font-mono">{c.ewb.no}</span> : c.ewbRequired ? <span className="text-[hsl(var(--chart-2))] font-medium">Required</span> : <span className="text-muted-foreground">Not required</span>}</td>
                  <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-1.5 text-right">{c.status !== "CLOSED" && <Button size="sm" variant="outline" onClick={() => setRecv(c)} data-testid={`button-receive-${c.id}`}><Undo2 className="h-3.5 w-3.5 mr-1" />Receive</Button>}</td>
                </tr>))}</tbody></table>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="in">
          <Card><CardContent className="p-0 overflow-x-auto">{!inward.length ? <Empty>No customer goods received for job work.</Empty> :
            <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Receipt</th><th className="text-left font-medium px-3">Principal / their challan</th><th className="text-left font-medium px-3">Goods</th><th className="text-right font-medium px-3">Received</th><th className="text-right font-medium px-3">Returned</th><th className="text-right font-medium px-3">Pending</th><th className="text-left font-medium px-3">Job work invoices</th><th className="text-left font-medium px-3">Status</th><th className="px-3" /></tr></thead>
              <tbody>{inward.map(r => (
                <tr key={r.id} className="border-b last:border-0 align-top" data-testid={`row-inward-${r.id}`}>
                  <td className="px-4 py-2 font-mono text-xs">{r.recNo}<div className="font-sans text-[11px] text-muted-foreground tabular-nums">{dmy(r.date)} · held {r.daysHeld} d</div></td>
                  <td className="px-3 py-2">{r.principal.name}<div className="text-[11px] text-muted-foreground font-mono">{r.principalChallanNo}</div></td>
                  <td className="px-3 py-2 text-xs">{r.lines.map(l => <div key={l.idx}>{l.description}</div>)}<div className="text-muted-foreground">{r.process}</div></td>
                  <td className="px-3 py-2 text-right tabular-nums">{qty(r.lines.reduce((s, l) => s + l.qty, 0))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{qty(r.lines.reduce((s, l) => s + l.returned, 0))}{r.lines.some(l => l.scrap) && <div className="text-[11px] text-muted-foreground">+{r.lines.reduce((s, l) => s + l.scrap, 0)} scrap</div>}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{qty(r.lines.reduce((s, l) => s + l.pending, 0))}</td>
                  <td className="px-3 py-2 text-xs space-y-0.5">{r.returns.map(x => <div key={x.id}><Link href={`/jw-invoice/${x.id}`} className="font-mono text-primary hover:underline" data-testid={`link-jw-invoice-${x.id}`}>{x.invNo}</Link> <span className="tabular-nums text-muted-foreground">{inr(x.total)}</span>{x.status === "CANCELLED" && <span className="text-destructive"> cancelled</span>}</div>)}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-1.5 text-right">{r.status !== "CLOSED" && <Button size="sm" variant="outline" onClick={() => setRet(r)} data-testid={`button-return-${r.id}`}>Return & bill</Button>}</td>
                </tr>))}</tbody></table>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="itc"><Itc04Tab /></TabsContent>
      </Tabs>
      <NewChallanDialog open={newOpen} onOpenChange={setNewOpen} />
      <NewInwardDialog open={inOpen} onOpenChange={setInOpen} />
      <ReceiveDialog ch={recv} onClose={() => setRecv(null)} />
      <ReturnDialog rec={ret} onClose={() => setRet(null)} />
    </>
  );
}

// ---------------- printable challan (triplicate) ----------------
const COPIES = ["ORIGINAL FOR CONSIGNEE", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR CONSIGNER"];
function ChallanCopy({ c, cfg, copy }: { c: Challan; cfg: any; copy: string }) {
  return (
    <div className="challan-copy space-y-3 text-xs">
      <div className="flex items-start gap-4 border-b pb-3">
        <div><div className="text-sm font-semibold">{cfg.legalName}</div><div className="text-muted-foreground">{cfg.plantAddress}, {cfg.plantCity} {cfg.plantPincode}</div><div className="font-mono mt-0.5">GSTIN {cfg.gstin} · State {cfg.stateCode} {STATES[cfg.stateCode]}</div></div>
        <div className="ml-auto text-right"><div className="text-[10px] font-semibold tracking-wider">{copy}</div><div className="text-sm font-semibold mt-1">Delivery Challan — Job Work</div><div className="font-mono font-semibold" data-testid="text-challan-no">{c.challanNo}</div><div className="tabular-nums">{dmy(c.date)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><div className="text-muted-foreground">Consignee (job worker)</div><div className="font-medium text-sm">{c.jobworker.name}</div><div>{c.jobworker.address}, {c.jobworker.city} {c.jobworker.pincode}</div><div className="font-mono">GSTIN {c.jobworker.gstin} · State {c.jobworker.stateCode} {STATES[c.jobworker.stateCode]}</div></div>
        <div className="text-right space-y-0.5"><div>Purpose: <b>Job work — {c.process}</b></div>{c.interstate && <div>Place of supply: {c.jobworker.stateCode} · {STATES[c.jobworker.stateCode]}</div>}
          <div>Vehicle {c.vehicleNo ?? "-"}{c.transporter && ` · ${c.transporter}`} · {c.distanceKm} km</div>{c.ewb?.status === "ACT" && <div>E-way bill <span className="font-mono">{c.ewb.no}</span></div>}<div>Expected back by {dmy(c.expectedReturn)}</div></div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-muted/40"><th className="text-left font-medium p-1.5">#</th><th className="text-left font-medium p-1.5">Description</th><th className="text-left font-medium p-1.5">HSN</th><th className="text-left font-medium p-1.5">Type</th><th className="text-right font-medium p-1.5">Qty</th><th className="text-right font-medium p-1.5">Rate</th><th className="text-right font-medium p-1.5">Taxable value</th><th className="text-left font-medium p-1.5">Return by</th></tr></thead>
        <tbody>{c.lines.map((l, i) => <tr key={l.id} className="border-b"><td className="p-1.5">{i + 1}</td><td className="p-1.5">{l.description}{l.batchNo && <div className="text-muted-foreground font-mono">Batch {l.batchNo}</div>}</td><td className="p-1.5 font-mono">{l.hsn}</td><td className="p-1.5">{KIND_SHORT[l.kind]}</td><td className="p-1.5 text-right tabular-nums">{qty(l.qty)} {l.uom}</td><td className="p-1.5 text-right tabular-nums">{inr2(l.rate)}</td><td className="p-1.5 text-right tabular-nums">{inr2(l.value)}</td><td className="p-1.5 tabular-nums">{l.due ? dmy(l.due) : "No limit"}</td></tr>)}
          <tr><td colSpan={6} className="p-1.5 text-right font-medium">Total value</td><td className="p-1.5 text-right tabular-nums font-semibold">{inr2(c.value)}</td><td /></tr></tbody>
      </table>
      <p className="text-muted-foreground">Goods sent for job work under Section 143 of the CGST Act, 2017 and Rule 45 of the CGST Rules — not a supply, no tax charged. Value shown for e-way bill and ITC-04 purposes. {amountInWords(c.value)}.</p>
      <div className="flex justify-between pt-8"><div className="border-t w-48 pt-1 text-center">Received by (job worker)</div><div className="border-t w-48 pt-1 text-center">For {cfg.legalName}<br />Authorised signatory</div></div>
    </div>
  );
}

export function ChallanPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Challan & { company: any }>({ queryKey: [`/api/jw/challans/${id}`] });
  const deemed = useAction("POST", (lineId: number) => `/api/jw/lines/${lineId}/deemed`, "Recorded as deemed supply — raise a tax invoice on the job worker");
  const c = q.data;
  if (!c) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Link href="/jobwork"><Button variant="ghost" size="sm" data-testid="button-back"><ArrowLeft className="h-4 w-4 mr-1" />Job work</Button></Link>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.print()} data-testid="button-print"><Printer className="h-4 w-4 mr-1" />Print (3 copies)</Button>
      </div>
      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Card className="print:shadow-none print:border-0"><CardContent className="p-6">
          {COPIES.map((cp, i) => <div key={cp} className={i ? "hidden print:block print:break-before-page" : ""}><ChallanCopy c={c} cfg={c.company} copy={cp} /></div>)}
        </CardContent></Card>
        <div className="space-y-4 print:hidden">
          <EDocPanel type="JWO" id={c.id} irn={false} ewbRequired={c.ewbRequired} ewbHint={c.interstate ? "Inter-state job work — required regardless of value (Rule 138)." : c.value > 50000 ? "Consignment value above ₹50,000." : undefined}
            defaults={{ vehicleNo: c.vehicleNo, transporter: c.transporter, distanceKm: c.distanceKm }} />
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Return status</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              {c.lines.map(l => <div key={l.id} className="rounded-md border p-2 space-y-1">
                <div className="font-medium">{l.description}</div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sent / back / loss</span><span className="tabular-nums">{qty(l.qty)} / {qty(l.receivedQty)} / {qty(l.lossQty)}</span></div>
                {l.deemedQty > 0 && <div className="flex justify-between text-destructive"><span>Deemed supplied</span><span className="tabular-nums">{qty(l.deemedQty)}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Pending</span><span className="tabular-nums font-medium">{qty(l.pending)} {l.uom}</span></div>
                <DaysLeft d={l.pending > 0 ? l.daysLeft : null} status={l.pending > 0 ? "" : "CLOSED"} />
                {l.overdue && l.pending > 0 && <div className="pt-1 space-y-1"><p className="text-destructive">Not returned within the time limit. Under Sec. 143 it is treated as supplied to the job worker on {dmy(c.date)}: pay GST with interest.</p>
                  <Button size="sm" variant="destructive" className="w-full" disabled={deemed.isPending} onClick={() => deemed.mutate(l.id as any)} data-testid={`button-deemed-${l.id}`}>Record deemed supply</Button></div>}
              </div>)}
              {c.receipts.length > 0 && <div className="space-y-1 pt-1"><div className="text-muted-foreground">Receipts</div>{c.receipts.map(r => <div key={r.id} className="flex justify-between"><span className="font-mono">{r.recNo}</span><span className="tabular-nums">{dmy(r.date)} · their {r.jwChallanNo}</span></div>)}</div>}
            </CardContent></Card>
        </div>
      </div>
    </div>
  );
}

// ---------------- job work invoice (Tau as job worker) ----------------
export function JwInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<JwReturn & { receipt: Inward; company: any }>({ queryKey: [`/api/jw/returns/${id}`] });
  const e = useEDoc("JWI", id).data ?? null;
  const r = q.data;
  if (!r) return <Skeleton className="h-96" />;
  const cfg = r.company, intra = !r.igst, rec = r.receipt;
  const q2 = r.lines.reduce((s, l) => s + l.qty, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Link href="/jobwork"><Button variant="ghost" size="sm" data-testid="button-back"><ArrowLeft className="h-4 w-4 mr-1" />Job work</Button></Link>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.print()} data-testid="button-print"><Printer className="h-4 w-4 mr-1" />Print</Button>
      </div>
      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Card className="print:shadow-none print:border-0 relative overflow-hidden">
          {r.status === "CANCELLED" && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-6xl font-bold text-destructive/15 -rotate-12">CANCELLED</span></div>}
          <CardContent className="p-6 space-y-5 text-sm">
            <div className="flex flex-wrap items-start gap-4 border-b pb-4">
              <div><div className="text-base font-semibold">{cfg.legalName}</div><div className="text-xs text-muted-foreground">{cfg.address}, {cfg.city} {cfg.pincode}</div><div className="text-xs font-mono mt-1">GSTIN {cfg.gstin} · State {cfg.stateCode} {STATES[cfg.stateCode]}</div></div>
              <div className="ml-auto text-right"><div className="text-xs uppercase tracking-wider text-muted-foreground">Tax Invoice — Job Work Charges</div><div className="font-mono font-semibold" data-testid="text-jwi-no">{r.invNo}</div><div className="text-xs tabular-nums">{dmy(r.date)}</div></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div><div className="text-muted-foreground mb-1">Bill to (principal)</div><div className="font-medium text-sm">{rec.principal.name}</div><div className="font-mono">GSTIN {rec.principal.gstin}</div></div>
              <div className="sm:text-right space-y-0.5"><div>Their challan <span className="font-mono">{rec.principalChallanNo}</span> dated {dmy(rec.principalChallanDate)}</div><div>Goods returned on our challan <span className="font-mono">{r.retNo}</span>{r.vehicleNo && ` · vehicle ${r.vehicleNo}`}</div><div>Place of supply: {rec.principal.stateCode} · {STATES[rec.principal.stateCode]}</div></div>
            </div>
            <IrnPrintBlock e={e} />
            <table className="w-full text-xs">
              <thead><tr className="border-y bg-muted/40 text-muted-foreground"><th className="text-left font-medium p-2">Service</th><th className="text-left font-medium p-2">SAC</th><th className="text-right font-medium p-2">Qty</th><th className="text-right font-medium p-2">Rate</th><th className="text-right font-medium p-2">Taxable</th>{intra ? <><th className="text-right font-medium p-2">CGST</th><th className="text-right font-medium p-2">SGST</th></> : <th className="text-right font-medium p-2">IGST</th>}</tr></thead>
              <tbody><tr className="border-b align-top"><td className="p-2"><div className="font-medium">Job work: {rec.process}</div>{r.lines.map(l => <div key={l.idx} className="text-muted-foreground">{rec.lines[l.idx]?.description} — {l.qty} returned{l.scrapQty ? `, ${l.scrapQty} scrap` : ""}</div>)}</td>
                <td className="p-2 font-mono">{r.sac}</td><td className="p-2 text-right tabular-nums">{q2} NOS</td><td className="p-2 text-right tabular-nums">{inr2(r.chargeRate)}</td><td className="p-2 text-right tabular-nums">{inr2(r.taxable)}</td>
                {intra ? <><td className="p-2 text-right tabular-nums">{inr2(r.cgst)}<div className="text-muted-foreground">{r.gstRate / 2}%</div></td><td className="p-2 text-right tabular-nums">{inr2(r.sgst)}<div className="text-muted-foreground">{r.gstRate / 2}%</div></td></> : <td className="p-2 text-right tabular-nums">{inr2(r.igst)}</td>}</tr></tbody>
            </table>
            <div className="flex flex-wrap gap-6 items-end">
              <div className="text-xs"><div className="text-muted-foreground">Amount in words</div><div className="font-medium">{amountInWords(r.total)}</div></div>
              <div className="ml-auto w-64 text-sm space-y-1 tabular-nums">
                <div className="flex justify-between"><span className="text-muted-foreground">Taxable value</span><span>{inr2(r.taxable)}</span></div>
                {intra ? <><div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{inr2(r.cgst)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{inr2(r.sgst)}</span></div></> : <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{inr2(r.igst)}</span></div>}
                {r.roundOff !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">Round off</span><span>{inr2(r.roundOff)}</span></div>}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Invoice total</span><span data-testid="text-jwi-total">{inr2(r.total)}</span></div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Goods are the property of the principal, processed and returned under Sec. 143 CGST.</p>
          </CardContent>
        </Card>
        <div className="print:hidden">{r.status === "ACTIVE" ? <EDocPanel type="JWI" id={r.id} ewbRequired={false} defaults={{ vehicleNo: r.vehicleNo, transporter: null, distanceKm: 0 }} /> :
          <Card><CardContent className="p-4 text-sm text-muted-foreground">This invoice is cancelled; the returned quantity was reopened.</CardContent></Card>}</div>
      </div>
    </div>
  );
}
