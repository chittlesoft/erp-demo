import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileJson, QrCode, Truck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_BASE } from "@/lib/queryClient";
import { useAction } from "@/lib/erp";
import { StatusBadge } from "@/components/layout";
import { Qr } from "@/components/labels";

export type EDoc = {
  irn: string | null; ackNo: string | null; ackDt: string | null; signedQr: string | null; irnStatus: "ACT" | "CNL" | null; irnAt: string | null; cancelReason: string | null; canCancelIrn: boolean;
  ewbNo: string | null; ewbDt: string | null; ewbValidTill: string | null; ewbStatus: "ACT" | "CNL" | null; canCancelEwb: boolean; mode: string;
} | null;
export type DocType = "INV" | "CRN" | "DBN" | "JWI" | "JWO";
export const useEDoc = (type: DocType, id: number | string) => useQuery<EDoc>({ queryKey: [`/api/gsp/${type}/${id}`] });
export const useP4Meta = () => useQuery<{ crnReasons: string[]; dbnReasons: string[]; downtimeReasons: string[]; cancelReasons: Record<string, string>; kinds: Record<string, string>; stations: Record<string, string> }>({ queryKey: ["/api/p4/meta"] });
export const useP4Config = () => useQuery<{ gspMode: "SIMULATED" | "LIVE"; gspProvider: string; gspEnv: string; aatoAbove5Cr: number; aato10Cr: number; plannedMin: number; live: { missing: string[] } }>({ queryKey: ["/api/p4/config"] });
const fmt = (ts: string | null) => ts ? ts.slice(0, 16).replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1") : "";

/** Printed e-invoice block: signed QR + IRN + Ack (shown on the document itself) */
export function IrnPrintBlock({ e }: { e: EDoc }) {
  if (!e?.irn) return null;
  return (
    <div className="flex items-start gap-3 rounded-md border p-2" data-testid="block-irn-print">
      {e.signedQr && e.irnStatus === "ACT" && <Qr text={e.signedQr} size="26mm" />}
      <div className="text-[10px] leading-snug min-w-0">
        <div className="font-semibold text-[11px]">{e.irnStatus === "CNL" ? "IRN CANCELLED" : "E-invoice"}{e.mode === "SIMULATED" && <span className="ml-1 font-normal text-muted-foreground">(sandbox simulation — not a legal IRN)</span>}</div>
        <div className="font-mono break-all">IRN {e.irn}</div>
        <div>Ack no. <span className="font-mono">{e.ackNo}</span> · Ack date {fmt(e.ackDt)}</div>
        {e.ewbNo && <div>E-way bill <span className="font-mono">{e.ewbNo}</span> · valid till {fmt(e.ewbValidTill)}{e.ewbStatus === "CNL" && " (cancelled)"}</div>}
      </div>
    </div>
  );
}

function CancelIrnDialog({ open, onOpenChange, type, id }: { open: boolean; onOpenChange: (o: boolean) => void; type: DocType; id: number }) {
  const reasons = useP4Meta().data?.cancelReasons ?? {};
  const [f, setF] = useState({ reason: "2", remark: "" });
  useEffect(() => { if (open) setF({ reason: "2", remark: "" }); }, [open]);
  const go = useAction("POST", `/api/gsp/${type}/${id}/cancel-irn`, "IRN cancelled — document is now void");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cancel IRN</DialogTitle>
          <DialogDescription>Allowed only within 24 hours of generation. The document becomes void in the ERP (stock and order quantities are reversed) and its number cannot be reported again.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Reason</Label>
            <Select value={f.reason} onValueChange={v => setF({ ...f, reason: v })}><SelectTrigger data-testid="select-cancel-reason"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(reasons).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Remark</Label><Textarea rows={2} value={f.remark} onChange={e => setF({ ...f, remark: e.target.value })} data-testid="input-cancel-remark" /></div>
        </div>
        <DialogFooter><Button variant="destructive" disabled={go.isPending} onClick={() => go.mutate(f, { onSuccess: () => onOpenChange(false) })} data-testid="button-confirm-cancel-irn">Cancel IRN</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Side panel: generate / cancel IRN and e-way bill through the configured GST portal connection.
 * `irn = false` for documents that only need an e-way bill (job work challans).
 */
export function EDocPanel({ type, id, irn = true, ewbRequired, ewbHint, defaults, onVoid, voidable }: {
  type: DocType; id: number; irn?: boolean; ewbRequired: boolean; ewbHint?: string;
  defaults: { vehicleNo: string | null; transporter: string | null; distanceKm: number }; onVoid?: () => void; voidable?: boolean;
}) {
  const e = useEDoc(type, id).data ?? null;
  const cfg = useP4Config().data;
  const gen = useAction("POST", `/api/gsp/${type}/${id}/irn`, "IRN generated");
  const ewb = useAction("POST", `/api/gsp/${type}/${id}/ewb`, "E-way bill generated");
  const cewb = useAction("POST", `/api/gsp/${type}/${id}/cancel-ewb`, "E-way bill cancelled");
  const [t, setT] = useState({ vehicleNo: "", transporter: "", distanceKm: "" });
  useEffect(() => { setT({ vehicleNo: defaults.vehicleNo ?? "", transporter: defaults.transporter ?? "", distanceKm: String(defaults.distanceKm || "") }); }, [id, defaults.vehicleNo, defaults.distanceKm]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const status = irn ? (e?.irnStatus === "ACT" ? "IRN_OK" : e?.irnStatus === "CNL" ? "CNL" : "IRN_PENDING") : (e?.ewbStatus === "ACT" ? "EWB_OK" : ewbRequired ? "EWB_PENDING" : "NOT_REQUIRED");
  const canEwb = irn ? e?.irnStatus === "ACT" : true;
  const days = Math.max(1, Math.ceil((+t.distanceKm || 0) / 200));
  return (
    <Card className="h-fit">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex flex-wrap items-center gap-2">{irn ? "E-invoice & e-way bill" : "E-way bill"} <StatusBadge status={status} />
        {cfg && <span className="ml-auto text-[10px] font-normal text-muted-foreground" data-testid="text-gsp-mode">{cfg.gspMode === "SIMULATED" ? "Sandbox simulation" : `Live · ${cfg.gspProvider || "GSP"}`}</span>}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {irn && !e?.irn && <>
          <p className="text-xs text-muted-foreground">Registers the document with the Invoice Registration Portal and returns the IRN, acknowledgement and signed QR code for printing.</p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={gen.isPending} onClick={() => gen.mutate({})} data-testid="button-generate-irn"><QrCode className="h-4 w-4 mr-1" />{gen.isPending ? "Sending…" : "Generate IRN"}</Button>
            <a href={`${API_BASE}/api/gsp/${type}/${id}/json`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="icon" aria-label="Download e-invoice JSON" data-testid="button-edoc-json"><FileJson className="h-4 w-4" /></Button></a>
          </div>
          {cfg?.aato10Cr ? <p className="text-[11px] text-[hsl(var(--chart-2))]">Turnover ₹10 Cr+: report within 30 days of the document date.</p> : null}
        </>}
        {irn && e?.irn && <div className="space-y-1 text-xs">
          <div className="text-muted-foreground">IRN</div><div className="font-mono break-all text-[11px]" data-testid="text-irn">{e.irn}</div>
          <div className="flex justify-between pt-1"><span className="text-muted-foreground">Ack no.</span><span className="font-mono" data-testid="text-ack">{e.ackNo}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Ack date</span><span className="tabular-nums">{fmt(e.ackDt)}</span></div>
          {e.irnStatus === "CNL" && <div className="text-destructive">Cancelled: {e.cancelReason}</div>}
          {e.canCancelIrn && <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setCancelOpen(true)} data-testid="button-cancel-irn"><XCircle className="h-4 w-4 mr-1" />Cancel IRN (within 24 h)</Button>}
          {e.irnStatus === "ACT" && !e.canCancelIrn && e.ewbStatus !== "ACT" && <p className="text-[11px] text-muted-foreground pt-1">The 24-hour cancellation window has passed — use a credit note for corrections.</p>}
        </div>}
        {(ewbRequired || e?.ewbNo) && <div className="border-t pt-3 space-y-2">
          <div className="text-xs font-medium flex items-center gap-1"><Truck className="h-3.5 w-3.5" />E-way bill {!ewbRequired && <span className="text-muted-foreground font-normal">(optional)</span>}</div>
          {ewbHint && <p className="text-[11px] text-muted-foreground">{ewbHint}</p>}
          {e?.ewbStatus === "ACT" ? <div className="text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">EWB no.</span><span className="font-mono" data-testid="text-ewb">{e.ewbNo}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Valid till</span><span className="tabular-nums">{fmt(e.ewbValidTill)}</span></div>
            {e.canCancelEwb && <Button variant="outline" size="sm" className="w-full mt-1" disabled={cewb.isPending} onClick={() => cewb.mutate({})} data-testid="button-cancel-ewb">Cancel e-way bill</Button>}
          </div> : canEwb ? <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Vehicle no.</Label><Input className="font-mono text-xs h-8" value={t.vehicleNo} onChange={x => setT({ ...t, vehicleNo: x.target.value.toUpperCase() })} placeholder="MH12AB1234" data-testid="input-ewb-vehicle" /></div>
              <div className="space-y-1"><Label className="text-xs">Distance (km)</Label><Input className="text-xs h-8" inputMode="numeric" value={t.distanceKm} onChange={x => setT({ ...t, distanceKm: x.target.value.replace(/\D/g, "") })} data-testid="input-ewb-distance" /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Transporter</Label><Input className="text-xs h-8" value={t.transporter} onChange={x => setT({ ...t, transporter: x.target.value })} data-testid="input-ewb-transporter" /></div>
            <p className="text-[11px] text-muted-foreground">Validity: {days} day{days > 1 ? "s" : ""} (1 day per 200 km).</p>
            <Button size="sm" variant="secondary" className="w-full" disabled={ewb.isPending} onClick={() => ewb.mutate({ vehicleNo: t.vehicleNo, transporter: t.transporter || null, distanceKm: +t.distanceKm })} data-testid="button-generate-ewb">Generate e-way bill</Button>
          </> : <p className="text-[11px] text-muted-foreground">Generate the IRN first — the e-way bill is created from it.</p>}
        </div>}
        {voidable && onVoid && <Button variant="ghost" size="sm" className="w-full text-destructive" onClick={onVoid} data-testid="button-void">Cancel document (no IRN yet)</Button>}
        <Link href="/accounts" className="block text-[11px] text-muted-foreground underline-offset-2 hover:underline">GST portal settings & API log</Link>
      </CardContent>
      <CancelIrnDialog open={cancelOpen} onOpenChange={setCancelOpen} type={type} id={id} />
    </Card>
  );
}
