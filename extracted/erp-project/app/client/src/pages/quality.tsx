import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Plus, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAction, useItems, useParties, qty } from "@/lib/erp";
import { PageIntro, StatusBadge, Empty } from "@/components/layout";
import { PdiTab } from "@/pages/pdi";

type Pending = { itemId: number; itemCode: string; itemName: string; uom: string; batchNo: string | null; qty: number; ref: string; receivedOn: string; sample: number };
type Ncr = { id: number; ncr_no: string; date: string; source: string; ref: string; itemCode: string; itemName: string; batch_no: string | null; serial_no: string | null; qty: number; defect: string; disposition: string; status: string; closed_on: string | null; remarks: string | null };
type Ppap = { id: number; item_id: number; customer_id: number; itemCode: string; itemName: string; customerPartNo: string | null; customer: string; level: number; status: string; submitted_on: string | null; approved_on: string | null; remarks: string };

const CHECKS: [string, string][] = [["coc", "Supplier CoC / test report received"], ["visual", "Visual inspection OK"], ["dimensional", "Dimensional check OK (sample)"], ["functional", "Functional / electrical check OK (sample)"]];

function InspectDialog({ lot, onClose }: { lot: Pending | null; onClose: () => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [rej, setRej] = useState("0"); const [defect, setDefect] = useState(""); const [insp, setInsp] = useState("N. More");
  useEffect(() => { setChecks(Object.fromEntries(CHECKS.map(([k]) => [k, true]))); setRej("0"); setDefect(""); }, [lot]);
  const save = useAction("POST", "/api/qc/inspect", "Inspection recorded");
  if (!lot) return null;
  const r = +rej || 0, acc = +(lot.qty - r).toFixed(3);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Incoming inspection — {lot.itemCode}</DialogTitle>
          <DialogDescription>Batch <span className="font-mono">{lot.batchNo ?? "—"}</span> · lot {qty(lot.qty)} {lot.uom} · {lot.ref}. Sample size <b>{lot.sample}</b> (AQL general level II).</DialogDescription></DialogHeader>
        <div className="space-y-2">{CHECKS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={checks[k]} onCheckedChange={v => setChecks(s => ({ ...s, [k]: v === true }))} data-testid={`check-${k}`} />{l}</label>))}</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Accepted</Label><Input value={String(acc)} disabled data-testid="input-accepted" /></div>
          <div className="space-y-1"><Label>Rejected</Label><Input value={rej} onChange={e => setRej(e.target.value)} data-testid="input-rejected" /></div>
          <div className="space-y-1"><Label>Inspector</Label><Input value={insp} onChange={e => setInsp(e.target.value)} data-testid="input-inspector" /></div>
        </div>
        {r > 0 && <div className="space-y-1"><Label>Defect description (raises NCR)</Label><Input value={defect} onChange={e => setDefect(e.target.value)} placeholder="e.g. Bent terminal pins" data-testid="input-defect" /></div>}
        <p className="text-[11px] text-muted-foreground">Accepted quantity moves from QC quarantine to Raw Material Stores, ready for put-away. Rejected quantity moves to the reject cage and gets an NCR.</p>
        <DialogFooter><Button disabled={save.isPending || r < 0 || r > lot.qty} onClick={() => save.mutate({ itemId: lot.itemId, batchNo: lot.batchNo, accepted: acc, rejected: r, inspector: insp, checks, defect }, { onSuccess: onClose })} data-testid="button-save-inspection">
          <ClipboardCheck className="h-4 w-4 mr-1" />{r === 0 ? "Accept lot" : acc === 0 ? "Reject lot" : "Accept partially"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncomingTab() {
  const pending = useQuery<Pending[]>({ queryKey: ["/api/qc/pending"] }).data;
  const hist = useQuery<any[]>({ queryKey: ["/api/qc/inspections"] }).data ?? [];
  const [lot, setLot] = useState<Pending | null>(null);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Awaiting inspection (QC quarantine)</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {!pending ? <div className="p-4"><Skeleton className="h-20" /></div> : pending.length === 0 ? <Empty>No lots in quarantine</Empty> : (
            <table className="w-full text-sm min-w-[640px]"><thead><tr className="text-xs text-muted-foreground border-y bg-muted/40"><th className="text-left font-medium px-4 py-2">Item</th><th className="text-left font-medium px-3">Batch</th><th className="text-left font-medium px-3">GRN / ref</th><th className="text-right font-medium px-3">Lot qty</th><th className="text-right font-medium px-3">Sample</th><th /></tr></thead>
              <tbody>{pending.map(p => (
                <tr key={`${p.itemId}-${p.batchNo}`} className="border-b"><td className="px-4 py-2"><div className="font-mono text-xs">{p.itemCode}</div><div className="text-[11px] text-muted-foreground">{p.itemName}</div></td>
                  <td className="px-3 font-mono text-xs">{p.batchNo ?? "—"}</td><td className="px-3 font-mono text-xs">{p.ref}<div className="text-[11px] text-muted-foreground font-sans">{p.receivedOn}</div></td>
                  <td className="px-3 text-right tabular-nums">{qty(p.qty)} {p.uom}</td><td className="px-3 text-right tabular-nums">{p.sample}</td>
                  <td className="px-4 text-right"><Button size="sm" onClick={() => setLot(p)} data-testid={`button-inspect-${p.itemCode}`}>Inspect</Button></td></tr>))}</tbody></table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Inspection history</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">{hist.length === 0 ? <Empty>No inspections yet</Empty> : (
          <table className="w-full text-sm min-w-[640px]"><tbody>{hist.map(h => (
            <tr key={h.id} className="border-t"><td className="px-4 py-2 font-mono text-xs">{h.insp_no}</td><td className="px-3 text-xs">{h.date}</td><td className="px-3 font-mono text-xs">{h.itemCode}</td><td className="px-3 font-mono text-xs">{h.batch_no}</td>
              <td className="px-3 text-right tabular-nums text-xs">{qty(h.accepted)} ok / <span className={h.rejected ? "text-destructive" : ""}>{qty(h.rejected)} rej</span></td><td className="px-3"><StatusBadge status={h.result === "PARTIAL" ? "PARTIAL" : h.result} /></td><td className="px-4 text-xs text-muted-foreground">{h.inspector}</td></tr>))}</tbody></table>)}
        </CardContent>
      </Card>
      <InspectDialog lot={lot} onClose={() => setLot(null)} />
    </div>
  );
}

function NcrTab() {
  const data = useQuery<Ncr[]>({ queryKey: ["/api/qc/ncrs"] }).data;
  const [closing, setClosing] = useState<Ncr | null>(null);
  const [disp, setDisp] = useState("RTV"); const [remarks, setRemarks] = useState("");
  const close = useAction("POST", `/api/qc/ncrs/${closing?.id}/close`, "NCR closed");
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {!data ? <div className="p-4"><Skeleton className="h-20" /></div> : data.length === 0 ? <Empty>No NCRs</Empty> : (
          <table className="w-full text-sm min-w-[860px]"><thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">NCR</th><th className="text-left font-medium px-3">Source</th><th className="text-left font-medium px-3">Item / batch / serial</th><th className="text-right font-medium px-3">Qty</th><th className="text-left font-medium px-3">Defect</th><th className="text-left font-medium px-3">Disposition</th><th className="text-left font-medium px-3">Status</th><th /></tr></thead>
            <tbody>{data.map(n => (
              <tr key={n.id} className="border-b align-top" data-testid={`row-ncr-${n.id}`}><td className="px-4 py-2"><div className="font-mono text-xs">{n.ncr_no}</div><div className="text-[11px] text-muted-foreground">{n.date}</div></td>
                <td className="px-3 py-2 text-xs">{n.source === "INCOMING" ? "Incoming" : n.source === "PDI" ? "Pre-dispatch" : "In-process"}<div className="text-[11px] text-muted-foreground font-mono">{n.ref}</div></td>
                <td className="px-3 py-2"><div className="font-mono text-xs">{n.itemCode}</div><div className="text-[11px] text-muted-foreground font-mono">{n.serial_no ?? n.batch_no}</div></td>
                <td className="px-3 py-2 text-right tabular-nums">{qty(n.qty)}</td><td className="px-3 py-2 text-xs max-w-[220px]">{n.defect}</td>
                <td className="px-3 py-2 text-xs">{({ RTV: "Return to vendor", SCRAP: "Scrap", UAI: "Use as is (deviation)", PENDING: "Pending" } as Record<string, string>)[n.disposition] ?? n.disposition}{n.remarks && <div className="text-[11px] text-muted-foreground">{n.remarks}</div>}</td>
                <td className="px-3 py-2"><StatusBadge status={n.status} /></td>
                <td className="px-4 py-2 text-right">{n.status === "OPEN" && <Button size="sm" variant="outline" onClick={() => { setClosing(n); setDisp("RTV"); setRemarks(""); }} data-testid={`button-close-ncr-${n.id}`}>Disposition</Button>}</td></tr>))}</tbody></table>
        )}
      </CardContent>
      {closing && <Dialog open onOpenChange={o => !o && setClosing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close {closing.ncr_no}</DialogTitle><DialogDescription>{closing.itemCode} · {qty(closing.qty)} · {closing.defect}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Disposition</Label><Select value={disp} onValueChange={setDisp}><SelectTrigger data-testid="select-ncr-disposition"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="RTV">Return to vendor (debit note)</SelectItem><SelectItem value="SCRAP">Scrap</SelectItem><SelectItem value="UAI">Use as is (approved deviation, back to stores)</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Remarks</Label><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Debit note no. / deviation approval / 8D ref" data-testid="input-ncr-remarks" /></div>
          </div>
          <DialogFooter><Button disabled={!remarks.trim() || close.isPending} onClick={() => close.mutate({ disposition: disp, remarks }, { onSuccess: () => setClosing(null) })} data-testid="button-confirm-ncr">Close NCR</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </Card>
  );
}

function PpapTab() {
  const data = useQuery<Ppap[]>({ queryKey: ["/api/qc/ppap"] }).data;
  const fg = (useItems().data ?? []).filter(i => i.type === "FG");
  const customers = useParties("CUSTOMER").data ?? [];
  const [edit, setEdit] = useState<Partial<Ppap> | null>(null);
  const save = useAction("POST", "/api/qc/ppap", "PPAP register updated");
  return (
    <Card>
      <div className="p-3 border-b flex items-center gap-3"><span className="text-xs text-muted-foreground">Production Part Approval status per OEM part and customer. Part Submission Warrant (PSW) approval date is required for Approved.</span>
        <Button size="sm" className="ml-auto" onClick={() => setEdit({ level: 3, status: "PENDING", remarks: "" })} data-testid="button-new-ppap"><Plus className="h-4 w-4 mr-1" />Add part</Button></div>
      <CardContent className="p-0 overflow-x-auto">
        {!data ? <div className="p-4"><Skeleton className="h-20" /></div> : (
          <table className="w-full text-sm min-w-[860px]"><thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Customer</th><th className="text-left font-medium px-3">Part</th><th className="text-left font-medium px-3">OEM part no.</th><th className="text-center font-medium px-3">Level</th><th className="text-left font-medium px-3">Status</th><th className="text-left font-medium px-3">Submitted</th><th className="text-left font-medium px-3">PSW approved</th><th className="text-left font-medium px-3">Remarks</th><th /></tr></thead>
            <tbody>{data.map(p => (
              <tr key={p.id} className="border-b" data-testid={`row-ppap-${p.id}`}><td className="px-4 py-2 text-xs">{p.customer}</td><td className="px-3"><div className="font-mono text-xs">{p.itemCode}</div><div className="text-[11px] text-muted-foreground">{p.itemName}</div></td>
                <td className="px-3 font-mono text-xs">{p.customerPartNo ?? "—"}</td><td className="px-3 text-center tabular-nums">{p.level}</td><td className="px-3"><StatusBadge status={p.status} /></td>
                <td className="px-3 text-xs tabular-nums">{p.submitted_on ?? "—"}</td><td className="px-3 text-xs tabular-nums">{p.approved_on ?? "—"}</td><td className="px-3 text-xs text-muted-foreground max-w-[220px]">{p.remarks}</td>
                <td className="px-4 text-right"><Button size="icon" variant="ghost" onClick={() => setEdit(p)} aria-label="Edit" data-testid={`button-edit-ppap-${p.id}`}><Pencil className="h-4 w-4" /></Button></td></tr>))}</tbody></table>
        )}
      </CardContent>
      {edit && <Dialog open onOpenChange={o => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit.id ? `PPAP — ${edit.itemCode} for ${edit.customer}` : "Add PPAP record"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {!edit.id && <>
              <div className="col-span-2 space-y-1"><Label>Part</Label><Select value={edit.item_id ? String(edit.item_id) : ""} onValueChange={v => setEdit({ ...edit, item_id: +v })}><SelectTrigger data-testid="select-ppap-item"><SelectValue placeholder="Choose part" /></SelectTrigger><SelectContent>{fg.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2 space-y-1"><Label>Customer</Label><Select value={edit.customer_id ? String(edit.customer_id) : ""} onValueChange={v => setEdit({ ...edit, customer_id: +v })}><SelectTrigger data-testid="select-ppap-customer"><SelectValue placeholder="Choose customer" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            </>}
            <div className="space-y-1"><Label>Submission level</Label><Select value={String(edit.level ?? 3)} onValueChange={v => setEdit({ ...edit, level: +v })}><SelectTrigger data-testid="select-ppap-level"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map(l => <SelectItem key={l} value={String(l)}>Level {l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Status</Label><Select value={edit.status ?? "PENDING"} onValueChange={v => setEdit({ ...edit, status: v })}><SelectTrigger data-testid="select-ppap-status"><SelectValue /></SelectTrigger><SelectContent>{["PENDING", "SUBMITTED", "INTERIM", "APPROVED", "REJECTED"].map(s => <SelectItem key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Submitted on</Label><Input type="date" value={edit.submitted_on ?? ""} onChange={e => setEdit({ ...edit, submitted_on: e.target.value || null })} data-testid="input-ppap-submitted" /></div>
            <div className="space-y-1"><Label>PSW approved on</Label><Input type="date" value={edit.approved_on ?? ""} onChange={e => setEdit({ ...edit, approved_on: e.target.value || null })} data-testid="input-ppap-approved" /></div>
            <div className="col-span-2 space-y-1"><Label>Remarks</Label><Input value={edit.remarks ?? ""} onChange={e => setEdit({ ...edit, remarks: e.target.value })} data-testid="input-ppap-remarks" /></div>
          </div>
          <DialogFooter><Button disabled={!edit.item_id || !edit.customer_id || save.isPending} onClick={() => save.mutate({ id: edit.id, itemId: edit.item_id, customerId: edit.customer_id, level: edit.level ?? 3, status: edit.status ?? "PENDING", submittedOn: edit.submitted_on ?? null, approvedOn: edit.approved_on ?? null, remarks: edit.remarks ?? "" }, { onSuccess: () => setEdit(null) })} data-testid="button-save-ppap">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </Card>
  );
}

/** remembers the last Quality tab while the app is open */
export const qualityTab = { current: "incoming" };

export default function Quality() {
  const [tab, setTab] = useState(() => qualityTab.current);
  useEffect(() => { qualityTab.current = tab; }, [tab]);
  return (
    <>
      <PageIntro>Incoming inspection releases goods from QC quarantine. Rejections and shop-floor scrap raise NCRs automatically. Pre-dispatch inspection (PDI) must accept a lot before it can be invoiced. The PPAP register tracks part approval per OEM customer.</PageIntro>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="incoming" data-testid="tab-incoming">Incoming inspection</TabsTrigger><TabsTrigger value="pdi" data-testid="tab-pdi">Pre-dispatch (PDI)</TabsTrigger><TabsTrigger value="ncr" data-testid="tab-ncr">NCRs</TabsTrigger><TabsTrigger value="ppap" data-testid="tab-ppap">PPAP register</TabsTrigger></TabsList>
        <TabsContent value="incoming"><IncomingTab /></TabsContent>
        <TabsContent value="pdi"><PdiTab /></TabsContent>
        <TabsContent value="ncr"><NcrTab /></TabsContent>
        <TabsContent value="ppap"><PpapTab /></TabsContent>
      </Tabs>
    </>
  );
}
