"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { ClipboardCheck, ShieldAlert, FileCheck2, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useApi, useAction, qty } from "@/lib/erp/client";
import type { Inspection, Ncr, Ppap, ItemRow, Party } from "@/lib/erp/shared";
import { asRole, canEdit } from "@/lib/erp/auth-shared";
import { PageIntro, Empty, StatusBadge, SectionCard } from "../shared";
import type { PlanRow, PendingRow, PdiReportDetail } from "@/lib/erp/pdi-shared";
import { dmy } from "@/lib/erp/pdi-shared";
import { PdiPlanDialog } from "../pdi-plan-dialog";
import { PdiInspectionDialog } from "../pdi-inspection-dialog";
import { PdiReportView } from "../pdi-report-view";

export default function QualityPage() {
  const { data: inspections } = useApi<Inspection[]>("/api/phase3/inspections");
  const { data: ncrs } = useApi<Ncr[]>("/api/phase3/ncrs");
  const { data: ppaps } = useApi<(Ppap & { customer: Party })[]>("/api/phase3/ppaps");
  return (
    <>
      <PageIntro>
        Incoming (IQC) inspection with AQL sampling, non-conformance (NCR) register with disposition, PPAP status per OEM customer &amp; part, and pre-dispatch inspection (PDI) per finished-good part.
      </PageIntro>
      <Tabs defaultValue="iqc">
        <TabsList>
          <TabsTrigger value="iqc"><ClipboardCheck className="h-3.5 w-3.5 mr-1" />Inspections</TabsTrigger>
          <TabsTrigger value="ncr"><ShieldAlert className="h-3.5 w-3.5 mr-1" />NCRs</TabsTrigger>
          <TabsTrigger value="ppap"><FileCheck2 className="h-3.5 w-3.5 mr-1" />PPAP</TabsTrigger>
          <TabsTrigger value="pdi"><ClipboardCheck className="h-3.5 w-3.5 mr-1" />PDI</TabsTrigger>
        </TabsList>
        <TabsContent value="iqc" className="mt-4"><InspectionList inspections={inspections ?? []} /></TabsContent>
        <TabsContent value="ncr" className="mt-4"><NcrList ncrs={ncrs ?? []} /></TabsContent>
        <TabsContent value="ppap" className="mt-4"><PpapList ppaps={ppaps ?? []} /></TabsContent>
        <TabsContent value="pdi" className="mt-4"><PdiTab /></TabsContent>
      </Tabs>
    </>
  );
}

function InspectionList({ inspections }: { inspections: Inspection[] }) {
  const { data: session } = useSession();
  const canMutate = canEdit(asRole(session?.user?.role));
  const [open, setOpen] = useState(false);
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const [grnNo, setGrnNo] = useState("");
  const [itemId, setItemId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [lotQty, setLotQty] = useState("");
  const [sampleQty, setSampleQty] = useState("5");
  const [accepted, setAccepted] = useState("");
  const [rejected, setRejected] = useState("");
  const [notes, setNotes] = useState("");
  const inspect = useAction("POST", "/api/phase3/iqc", "Inspection recorded — stock moved");
  const submit = () => inspect.mutate({ grnNo, itemId: Number(itemId), batchNo: batchNo || null, lotQty: Number(lotQty), sampleQty: Number(sampleQty), accepted: Number(accepted), rejected: Number(rejected), notes } as never, { onSuccess: () => onOpenChange(false) });
  function onOpenChange(o: boolean) { setOpen(o); }
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2 flex items-center"><h2 className="text-sm font-semibold">Incoming inspections (IQC)</h2><div className="ml-auto">{canMutate && (<Button size="sm" onClick={() => setOpen(true)}><ClipboardCheck className="h-3.5 w-3.5 mr-1" />New inspection</Button>)}</div></div>
      <div className="overflow-x-auto scroll-thin">
        {inspections.length === 0 ? <Empty>No inspections yet — goods are in QC quarantine awaiting release</Empty> : (
          <table className="zebra w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">{["Date", "Ref", "Item", "Lot", "Sample", "Accepted", "Rejected", "Result"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${(i >= 3 && i <= 6) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-5 py-2 font-mono text-xs">{i.date}</td>
                  <td className="px-5 text-xs"><span className="font-mono">{i.refNo}</span><span className="text-muted-foreground block">{i.refType}</span></td>
                  <td className="px-5 text-xs font-mono">{items?.find((x) => x.id === i.itemId)?.code ?? i.itemId}</td>
                  <td className="px-5 text-right tabular-nums">{qty(i.lotQty)}</td>
                  <td className="px-5 text-right tabular-nums">{qty(i.sampleQty)}</td>
                  <td className="px-5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{qty(i.acceptedQty)}</td>
                  <td className="px-5 text-right tabular-nums text-destructive">{qty(i.rejectedQty)}</td>
                  <td className="px-5"><StatusBadge status={i.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Incoming inspection (IQC)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">GRN no.</Label><Input className="mt-1 font-mono" value={grnNo} onChange={(e) => setGrnNo(e.target.value)} /></div>
              <div><Label className="text-xs">Item</Label><select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Select item</option>{(items ?? []).map((it) => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}</select></div>
              <div><Label className="text-xs">Batch no.</Label><Input className="mt-1 font-mono" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></div>
              <div><Label className="text-xs">Lot qty</Label><Input className="mt-1" type="number" value={lotQty} onChange={(e) => setLotQty(e.target.value)} /></div>
              <div><Label className="text-xs">Sample size</Label><Input className="mt-1" type="number" value={sampleQty} onChange={(e) => setSampleQty(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Accepted</Label><Input className="mt-1" type="number" value={accepted} onChange={(e) => setAccepted(e.target.value)} /></div><div><Label className="text-xs">Rejected</Label><Input className="mt-1" type="number" value={rejected} onChange={(e) => setRejected(e.target.value)} /></div></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="defect / reason" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={inspect.isPending}>Record &amp; move stock</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NcrList({ ncrs }: { ncrs: Ncr[] }) {
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2"><h2 className="text-sm font-semibold">Non-conformance register (NCR)</h2></div>
      <div className="overflow-x-auto scroll-thin">
        {ncrs.length === 0 ? <Empty>No NCRs</Empty> : (
          <table className="zebra w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">{["Date", "Source", "Ref", "Qty", "Defect", "Disposition", "Status"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {ncrs.map((n) => (
                <tr key={n.id} className="border-b last:border-0">
                  <td className="px-5 py-2 font-mono text-xs">{n.date}</td>
                  <td className="px-5 text-xs"><StatusBadge status={n.source} /></td>
                  <td className="px-5 font-mono text-xs">{n.refNo}</td>
                  <td className="px-5 text-right tabular-nums">{qty(n.qty)}</td>
                  <td className="px-5 text-xs">{n.defect}</td>
                  <td className="px-5 text-xs">{n.disposition}</td>
                  <td className="px-5"><StatusBadge status={n.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PpapList({ ppaps }: { ppaps: (Ppap & { customer: Party })[] }) {
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2"><h2 className="text-sm font-semibold">PPAP register</h2></div>
      <div className="overflow-x-auto scroll-thin">
        {ppaps.length === 0 ? <Empty>No PPAP records — seed data is illustrative</Empty> : (
          <table className="zebra w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">{["Customer", "Item", "Level", "Submission", "PSW date", "Status"].map((h, i) => <th key={i} className="font-medium px-5 py-2 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {ppaps.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-5 py-2">{p.customer.name}</td>
                  <td className="px-5 text-xs font-mono">{p.itemId}</td>
                  <td className="px-5 text-xs">Level {p.level}</td>
                  <td className="px-5 text-xs">{p.submissionDate ?? "—"}</td>
                  <td className="px-5 text-xs">{p.pswDate ?? "—"}</td>
                  <td className="px-5"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ===================== PDI tab =====================
function PdiTab() {
  const { data: session } = useSession();
  const canMutate = canEdit(asRole(session?.user?.role));
  const { data: plans, isLoading: plansLoading } = useApi<PlanRow[]>("/api/phase3/pdi/plans");
  const { data: pending, isLoading: pendingLoading } = useApi<PendingRow[]>("/api/phase3/pdi/pending");
  const { data: reports, isLoading: reportsLoading } = useApi<PdiReportDetail[]>("/api/phase3/pdi/reports");

  const [editItem, setEditItem] = useState<{ id: number; code: string; name: string } | null>(null);
  const [inspectRow, setInspectRow] = useState<PendingRow | null>(null);
  const [viewReportId, setViewReportId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {/* Plans */}
      <SectionCard
        title="PDI plans"
        subtitle="Characteristics checked before dispatch, per finished-good part. Parts with a plan cannot be invoiced until an accepted PDI covers the dispatch quantity."
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {plansLoading ? (
          <Skeleton className="h-32" />
        ) : !plans || plans.length === 0 ? (
          <Empty>No finished-good items found.</Empty>
        ) : (
          <table className="zebra w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium px-5 py-2">Part</th>
                <th className="text-left font-medium px-3">Customer part no.</th>
                <th className="text-left font-medium px-3">Drg. rev</th>
                <th className="text-left font-medium px-3">Characteristics</th>
                <th className="text-left font-medium px-3">Plan status</th>
                <th className="px-3" />
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.itemId} className="border-b last:border-0">
                  <td className="px-5 py-2">
                    <div className="font-mono text-xs">{p.code}</div>
                    <div className="text-xs text-muted-foreground">{p.name}</div>
                  </td>
                  <td className="px-3 text-xs font-mono">{p.customerPartNo ?? "—"}</td>
                  <td className="px-3 text-xs">{p.plan?.drgRev ?? "—"}</td>
                  <td className="px-3 text-xs tabular-nums">{p.plan?.chars.length ?? 0}</td>
                  <td className="px-3">
                    {p.plan ? (
                      <StatusBadge status="ACTIVE" />
                    ) : (
                      <StatusBadge status="PENDING" />
                    )}
                  </td>
                  <td className="px-3 text-right">
                    {canMutate && (
                      <Button size="sm" variant="outline" onClick={() => setEditItem({ id: p.itemId, code: p.code, name: p.name })}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit plan
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Pending inspection */}
      <SectionCard
        title="Awaiting pre-dispatch inspection"
        subtitle="Open sales-order lines for parts with a PDI plan. Complete a PDI for the dispatch quantity before invoicing."
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {pendingLoading ? (
          <Skeleton className="h-32" />
        ) : !pending || pending.length === 0 ? (
          <Empty>Nothing awaiting PDI. Open sales-order lines for parts with a PDI plan appear here.</Empty>
        ) : (
          <table className="zebra w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium px-5 py-2">Sales order</th>
                <th className="text-left font-medium px-3">Part</th>
                <th className="text-right font-medium px-3">Pending</th>
                <th className="text-right font-medium px-3">FG stock</th>
                <th className="text-right font-medium px-3">PDI done</th>
                <th className="px-3" />
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.soLineId} className="border-b last:border-0">
                  <td className="px-5 py-2">
                    <div className="font-mono text-xs">{r.soNo}</div>
                    <div className="text-xs text-muted-foreground">{r.customer}</div>
                  </td>
                  <td className="px-3">
                    <div className="font-mono text-xs">{r.itemCode}</div>
                    <div className="text-xs text-muted-foreground">{r.itemName}{r.customerPartNo && ` · ${r.customerPartNo}`}</div>
                  </td>
                  <td className="px-3 text-right tabular-nums">{qty(r.pending)}</td>
                  <td className={`px-3 text-right tabular-nums ${r.fgStock < r.toInspect ? "text-destructive" : ""}`}>{qty(r.fgStock)}</td>
                  <td className="px-3 text-right tabular-nums">{qty(r.covered)}</td>
                  <td className="px-3 text-right">
                    {r.toInspect > 0 ? (
                      canMutate ? (
                        <Button size="sm" onClick={() => setInspectRow(r)}>
                          <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Inspect
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Inspect</span>
                      )
                    ) : (
                      <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Ready to invoice</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Reports */}
      <SectionCard
        title="PDI reports"
        subtitle="Completed pre-dispatch inspections (format TPE/IMS/FR/78). Click View to open / print the report."
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {reportsLoading ? (
          <Skeleton className="h-32" />
        ) : !reports || reports.length === 0 ? (
          <Empty>No PDI reports yet.</Empty>
        ) : (
          <table className="zebra w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium px-5 py-2">PDI no.</th>
                <th className="text-left font-medium px-3">Customer</th>
                <th className="text-left font-medium px-3">Part</th>
                <th className="text-right font-medium px-3">Qty</th>
                <th className="text-right font-medium px-3">Sample</th>
                <th className="text-left font-medium px-3">Result</th>
                <th className="text-left font-medium px-3">Invoice</th>
                <th className="px-3" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-5 py-2">
                    <div className="font-mono text-xs">{r.pdiNo}</div>
                    <div className="text-[11px] text-muted-foreground">{dmy(r.date)} · {r.inspector}</div>
                  </td>
                  <td className="px-3 text-xs">{r.customer}<div className="text-[11px] text-muted-foreground font-mono">{r.soNo}</div></td>
                  <td className="px-3"><div className="font-mono text-xs">{r.itemCode}</div><div className="text-[11px] text-muted-foreground">{r.itemName}</div></td>
                  <td className="px-3 text-right tabular-nums">{qty(r.qty)}</td>
                  <td className="px-3 text-right tabular-nums">{r.sample}</td>
                  <td className="px-3"><StatusBadge status={r.result} /></td>
                  <td className="px-3 text-xs">
                    {r.invoiceNo ? (
                      <span className="font-mono">{r.invoiceNo}</span>
                    ) : (
                      <span className="text-muted-foreground">{r.result === "ACCEPT" ? "Awaiting invoice" : "—"}</span>
                    )}
                  </td>
                  <td className="px-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setViewReportId(r.id)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <PdiPlanDialog item={editItem} onClose={() => setEditItem(null)} />
      <PdiInspectionDialog row={inspectRow} onClose={() => setInspectRow(null)} />
      <PdiReportView reportId={viewReportId} onClose={() => setViewReportId(null)} />
    </div>
  );
}
