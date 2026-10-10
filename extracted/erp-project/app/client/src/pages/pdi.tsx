import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, Printer, ClipboardCheck, Plus, Trash2, Save, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAction, qty } from "@/lib/erp";
import { StatusBadge, Empty } from "@/components/layout";
import { qualityTab } from "@/pages/quality";

export const PDI_DOC = "Document No: TPE/IMS/FR/78, Rev. No:01, Rev. Date: 23.09.2026";
export type PdiChar = { sr: number; description: string; kind: "num" | "attr"; nominal: number | null; tolMinus: number | null; tolPlus: number | null; spec: string; method: string; unit: string };
export type PdiPlan = { itemId: number; drgRev: string; drgDate: string | null; refStandard: string; chars: PdiChar[] };
export type PdiReport = { id: number; pdiNo: string; date: string; soNo: string; customer: string; itemCode: string; itemName: string; customerPartNo: string | null; qty: number; sample: number;
  drgRev: string; drgDate: string | null; refStandard: string; mtr: boolean; chars: PdiChar[]; readings: { sr: number; values: string[]; ok: boolean }[]; result: string; inspector: string; note: string;
  invoiceId: number | null; invoiceNo: string | null; invoiceDate: string | null };
type PendingRow = { soId: number; soNo: string; soLineId: number; customer: string; itemId: number; itemCode: string; itemName: string; customerPartNo: string | null; pending: number; fgStock: number; covered: number; toInspect: number };
type PlanRow = { itemId: number; code: string; name: string; customerPartNo: string | null; plan: PdiPlan | null };

const dmy = (d: string | null) => (d ? d.split("-").reverse().join("-") : "");
export const specText = (c: PdiChar) => {
  if (c.kind === "attr" || c.nominal == null) return c.spec;
  const m = c.tolMinus ?? 0, p = c.tolPlus ?? 0;
  return m === p ? `${c.nominal}±${p}` : `${c.nominal} +${p}/-${m}`;
};
export function charOk(c: PdiChar, v: string) {
  const s = (v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (c.kind === "attr") return ["OK", "GO", "PASS", "Y", "YES", "1"].includes(s);
  const n = Number(s); if (!Number.isFinite(n) || c.nominal == null) return false;
  return n >= c.nominal - (c.tolMinus ?? 0) - 1e-9 && n <= c.nominal + (c.tolPlus ?? 0) + 1e-9;
}

// ---------------- Inspection dialog ----------------
function PdiDialog({ row, onClose }: { row: PendingRow | null; onClose: () => void }) {
  const plans = useQuery<PlanRow[]>({ queryKey: ["/api/pdi/plans"] }).data ?? [];
  const plan = plans.find(p => p.itemId === row?.itemId)?.plan ?? null;
  const [q, setQ] = useState(""); const [n, setN] = useState("5");
  const [mtr, setMtr] = useState(false); const [insp, setInsp] = useState("PDI Inspector"); const [note, setNote] = useState("");
  const [vals, setVals] = useState<Record<number, string[]>>({});
  useEffect(() => {
    if (!row) return;
    const qq = Math.min(row.toInspect, row.fgStock || row.toInspect);
    setQ(String(qq)); setN(String(Math.min(qq || 5, 5))); setMtr(false); setNote("");
    setVals({});
  }, [row?.soLineId]);
  const save = useAction("POST", "/api/pdi/reports", "PDI report saved");
  if (!row) return null;
  const S = Math.max(1, Math.min(10, Math.floor(+n || 1)));
  const get = (sr: number, i: number) => vals[sr]?.[i] ?? "";
  const set = (sr: number, i: number, v: string) => setVals(p => { const a = [...(p[sr] ?? [])]; a[i] = v; return { ...p, [sr]: a }; });
  const rowOk = (c: PdiChar) => { const r = Array.from({ length: S }, (_, i) => charOk(c, get(c.sr, i))); return r.some(x => x === null) ? null : r.every(Boolean); };
  const results = plan?.chars.map(rowOk) ?? [];
  const complete = results.length > 0 && results.every(r => r !== null);
  const overall = complete ? (results.every(Boolean) ? "ACCEPT" : "REJECT") : null;
  const fillOk = () => setVals(p => { const o = { ...p }; plan?.chars.filter(c => c.kind === "attr").forEach(c => { o[c.sr] = Array.from({ length: S }, () => "OK"); }); return o; });
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Pre-dispatch inspection — {row.itemCode}</DialogTitle>
          <DialogDescription>{row.itemName}{row.customerPartNo && <> · customer part no. <span className="font-mono">{row.customerPartNo}</span></>} · {row.customer} · {row.soNo}</DialogDescription></DialogHeader>
        {!plan ? <p className="text-sm text-destructive">No PDI plan for this part.</p> : <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1"><Label className="text-xs">Invoice qty</Label><Input type="number" min="1" max={row.toInspect} value={q} onChange={e => setQ(e.target.value)} data-testid="input-pdi-qty" /></div>
            <div className="space-y-1"><Label className="text-xs">Sampling no.</Label><Input type="number" min="1" max={10} value={n} onChange={e => setN(e.target.value)} data-testid="input-pdi-sample" /></div>
            <div className="space-y-1"><Label className="text-xs">Inspector</Label><Input value={insp} onChange={e => setInsp(e.target.value)} data-testid="input-pdi-inspector" /></div>
            <div className="space-y-1"><Label className="text-xs">Material test report</Label><div className="flex items-center gap-2 h-9"><Switch checked={mtr} onCheckedChange={setMtr} data-testid="switch-pdi-mtr" /><span className="text-sm">{mtr ? "Yes" : "No"}</span></div></div>
          </div>
          <div className="text-xs text-muted-foreground">Drg. rev {plan.drgRev} · {dmy(plan.drgDate)} · reference standard {plan.refStandard || "-"}</div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left font-medium p-2">Sr.</th><th className="text-left font-medium p-2">Description</th><th className="text-left font-medium p-2">Specification</th><th className="text-left font-medium p-2">Method</th>
                {Array.from({ length: S }, (_, i) => <th key={i} className="font-medium p-2 text-center w-20">{i + 1}</th>)}<th className="font-medium p-2">Remark</th></tr></thead>
              <tbody>{plan.chars.map((c, ci) => (
                <tr key={c.sr} className="border-t">
                  <td className="p-2 tabular-nums">{c.sr}</td><td className="p-2 whitespace-nowrap">{c.description}</td><td className="p-2 font-mono text-xs whitespace-nowrap">{specText(c)}</td><td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{c.method}</td>
                  {Array.from({ length: S }, (_, i) => { const v = get(c.sr, i); const ok = charOk(c, v); return (
                    <td key={i} className="p-1">{c.kind === "attr"
                      ? <Select value={v} onValueChange={x => set(c.sr, i, x)}><SelectTrigger className={`h-8 px-2 ${ok === false ? "border-destructive text-destructive" : ""}`} data-testid={`select-pdi-${c.sr}-${i}`}><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="OK">OK</SelectItem><SelectItem value="NG">NG</SelectItem></SelectContent></Select>
                      : <Input inputMode="decimal" className={`h-8 px-2 text-right tabular-nums ${ok === false ? "border-destructive text-destructive" : ""}`} value={v} onChange={e => set(c.sr, i, e.target.value)} data-testid={`input-pdi-${c.sr}-${i}`} />}</td>); })}
                  <td className="p-2">{results[ci] == null ? <span className="text-xs text-muted-foreground">—</span> : <StatusBadge status={results[ci] ? "ACCEPT" : "REJECT"} />}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Button variant="outline" size="sm" onClick={fillOk} data-testid="button-pdi-fill-ok">Mark all attribute checks OK</Button>
            <div className="flex-1 min-w-[220px] space-y-1"><Label className="text-xs">Note (optional)</Label><Input value={note} onChange={e => setNote(e.target.value)} data-testid="input-pdi-note" /></div>
          </div>
          {overall === "REJECT" && <p className="text-sm text-destructive">One or more characteristics are out of specification. Saving will record a rejected PDI and raise an NCR; the lot cannot be dispatched.</p>}
        </>}
        <DialogFooter className="items-center gap-3">
          {overall && <span className="text-sm">Result <StatusBadge status={overall} /></span>}
          <Button disabled={!plan || !complete || save.isPending || !(+q > 0)} data-testid="button-save-pdi"
            onClick={() => save.mutate({ soLineId: row.soLineId, qty: +q, sample: S, mtr, inspector: insp, note, readings: plan!.chars.map(c => ({ sr: c.sr, values: Array.from({ length: S }, (_, i) => get(c.sr, i)) })) }, { onSuccess: onClose })}>
            <ClipboardCheck className="h-4 w-4 mr-1" />Save PDI report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Plan editor ----------------
function PlanEditor() {
  const plans = useQuery<PlanRow[]>({ queryKey: ["/api/pdi/plans"] }).data;
  const [itemId, setItemId] = useState<string>("");
  const cur = plans?.find(p => String(p.itemId) === itemId);
  const [d, setD] = useState<PdiPlan | null>(null);
  useEffect(() => { if (plans && !itemId) { const first = plans.find(p => p.plan) ?? plans[0]; if (first) setItemId(String(first.itemId)); } }, [plans]);
  useEffect(() => { if (cur) setD(cur.plan ? JSON.parse(JSON.stringify(cur.plan)) : { itemId: cur.itemId, drgRev: "00", drgDate: null, refStandard: "-", chars: [] }); }, [itemId, cur?.plan]);
  const save = useAction("PUT", `/api/pdi/plans/${itemId}`, "PDI plan saved");
  if (!plans || !d) return <Skeleton className="h-40" />;
  const upd = (i: number, patch: Partial<PdiChar>) => setD({ ...d, chars: d.chars.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">PDI plans</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Characteristics checked before dispatch, per part. Parts with a plan cannot be invoiced until an accepted PDI covers the dispatch quantity.</p>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_100px_150px_160px] gap-3">
          <div className="space-y-1"><Label className="text-xs">Part</Label><Select value={itemId} onValueChange={setItemId}><SelectTrigger data-testid="select-plan-item"><SelectValue /></SelectTrigger>
            <SelectContent>{plans.map(p => <SelectItem key={p.itemId} value={String(p.itemId)}>{p.code} — {p.name}{p.plan ? "" : " (no plan)"}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs">Drg. rev</Label><Input value={d.drgRev} onChange={e => setD({ ...d, drgRev: e.target.value })} data-testid="input-plan-rev" /></div>
          <div className="space-y-1"><Label className="text-xs">Drg. date</Label><Input type="date" value={d.drgDate ?? ""} onChange={e => setD({ ...d, drgDate: e.target.value || null })} data-testid="input-plan-date" /></div>
          <div className="space-y-1"><Label className="text-xs">Reference standard</Label><Input value={d.refStandard} onChange={e => setD({ ...d, refStandard: e.target.value })} data-testid="input-plan-ref" /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium py-1 w-8">Sr.</th><th className="text-left font-medium px-1">Description</th><th className="text-left font-medium px-1 w-28">Type</th><th className="text-left font-medium px-1">Specification</th><th className="text-left font-medium px-1">Inspection method</th><th className="w-10" /></tr></thead>
            <tbody>{d.chars.map((c, i) => (
              <tr key={i} className="border-t">
                <td className="py-1.5 tabular-nums">{i + 1}</td>
                <td className="px-1"><Input className="h-8" value={c.description} onChange={e => upd(i, { description: e.target.value })} data-testid={`input-char-desc-${i}`} /></td>
                <td className="px-1"><Select value={c.kind} onValueChange={v => upd(i, { kind: v as any })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="num">Measured</SelectItem><SelectItem value="attr">OK / NG</SelectItem></SelectContent></Select></td>
                <td className="px-1">{c.kind === "num"
                  ? <div className="flex items-center gap-1"><Input className="h-8 w-20 text-right" placeholder="nominal" value={c.nominal ?? ""} onChange={e => upd(i, { nominal: numOrNull(e.target.value) })} data-testid={`input-char-nom-${i}`} />
                      <span className="text-xs text-muted-foreground">−</span><Input className="h-8 w-16 text-right" value={c.tolMinus ?? ""} onChange={e => upd(i, { tolMinus: numOrNull(e.target.value) })} data-testid={`input-char-tm-${i}`} />
                      <span className="text-xs text-muted-foreground">+</span><Input className="h-8 w-16 text-right" value={c.tolPlus ?? ""} onChange={e => upd(i, { tolPlus: numOrNull(e.target.value) })} data-testid={`input-char-tp-${i}`} />
                      <Input className="h-8 w-14" placeholder="unit" value={c.unit} onChange={e => upd(i, { unit: e.target.value })} /></div>
                  : <Input className="h-8 font-mono" value={c.spec} onChange={e => upd(i, { spec: e.target.value })} placeholder="e.g. M14x1.5-6g" data-testid={`input-char-spec-${i}`} />}</td>
                <td className="px-1"><Input className="h-8" value={c.method} onChange={e => upd(i, { method: e.target.value })} data-testid={`input-char-method-${i}`} /></td>
                <td><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove characteristic" onClick={() => setD({ ...d, chars: d.chars.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setD({ ...d, chars: [...d.chars, { sr: d.chars.length + 1, description: "", kind: "num", nominal: null, tolMinus: null, tolPlus: null, spec: "", method: "", unit: "mm" }] })} data-testid="button-add-char"><Plus className="h-4 w-4 mr-1" />Add characteristic</Button>
          <Button size="sm" className="ml-auto" disabled={save.isPending} onClick={() => save.mutate({ drgRev: d.drgRev, drgDate: d.drgDate, refStandard: d.refStandard, chars: d.chars })} data-testid="button-save-plan"><Save className="h-4 w-4 mr-1" />Save plan</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Tab ----------------
export function PdiTab() {
  const pending = useQuery<PendingRow[]>({ queryKey: ["/api/pdi/pending"] }).data;
  const reports = useQuery<PdiReport[]>({ queryKey: ["/api/pdi/reports"] }).data;
  const [sel, setSel] = useState<PendingRow | null>(null);
  if (!pending || !reports) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Awaiting pre-dispatch inspection</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {pending.length ? <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-y bg-muted/40"><th className="text-left font-medium px-4 py-2">Sales order</th><th className="text-left font-medium px-3">Part</th><th className="text-right font-medium px-3">Pending</th><th className="text-right font-medium px-3">FG stock</th><th className="text-right font-medium px-3">PDI done</th><th className="px-3" /></tr></thead>
            <tbody>{pending.map(r => (
              <tr key={r.soLineId} className="border-b last:border-0" data-testid={`row-pdi-pending-${r.itemCode}`}>
                <td className="px-4 py-2"><div className="font-mono text-xs">{r.soNo}</div><div className="text-xs text-muted-foreground">{r.customer}</div></td>
                <td className="px-3"><div className="font-mono text-xs">{r.itemCode}</div><div className="text-xs text-muted-foreground">{r.itemName}{r.customerPartNo && ` · ${r.customerPartNo}`}</div></td>
                <td className="px-3 text-right tabular-nums">{qty(r.pending)}</td>
                <td className={`px-3 text-right tabular-nums ${r.fgStock < r.toInspect ? "text-destructive" : ""}`}>{qty(r.fgStock)}</td>
                <td className="px-3 text-right tabular-nums">{qty(r.covered)}</td>
                <td className="px-3 text-right">{r.toInspect > 0 ? <Button size="sm" onClick={() => setSel(r)} data-testid={`button-pdi-${r.itemCode}`}><ClipboardCheck className="h-3.5 w-3.5 mr-1" />Inspect</Button>
                  : <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Ready to invoice</span>}</td>
              </tr>))}</tbody>
          </table> : <Empty>Nothing awaiting PDI. Open sales order lines for parts with a PDI plan appear here.</Empty>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">PDI reports</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-y bg-muted/40"><th className="text-left font-medium px-4 py-2">PDI no.</th><th className="text-left font-medium px-3">Customer</th><th className="text-left font-medium px-3">Part</th><th className="text-right font-medium px-3">Qty</th><th className="text-right font-medium px-3">Sample</th><th className="text-left font-medium px-3">Result</th><th className="text-left font-medium px-3">Invoice</th><th className="px-3" /></tr></thead>
            <tbody>{reports.map(r => (
              <tr key={r.id} className="border-b last:border-0" data-testid={`row-pdi-${r.pdiNo}`}>
                <td className="px-4 py-2"><div className="font-mono text-xs">{r.pdiNo}</div><div className="text-[11px] text-muted-foreground">{dmy(r.date)} · {r.inspector}</div></td>
                <td className="px-3 text-xs">{r.customer}<div className="text-[11px] text-muted-foreground font-mono">{r.soNo}</div></td>
                <td className="px-3"><div className="font-mono text-xs">{r.itemCode}</div><div className="text-[11px] text-muted-foreground">{r.itemName}</div></td>
                <td className="px-3 text-right tabular-nums">{qty(r.qty)}</td><td className="px-3 text-right tabular-nums">{r.sample}</td>
                <td className="px-3"><StatusBadge status={r.result} /></td>
                <td className="px-3 text-xs">{r.invoiceNo ? <Link href={`/invoice/${r.invoiceId}`} className="font-mono text-primary hover:underline">{r.invoiceNo}</Link> : <span className="text-muted-foreground">{r.result === "ACCEPT" ? "Awaiting invoice" : "—"}</span>}</td>
                <td className="px-3 text-right"><Link href={`/pdi/${r.id}`}><Button size="sm" variant="outline" data-testid={`button-view-pdi-${r.id}`}><FileText className="h-3.5 w-3.5 mr-1" />Report</Button></Link></td>
              </tr>))}</tbody>
          </table>
        </CardContent>
      </Card>
      <PlanEditor />
      <PdiDialog row={sel} onClose={() => setSel(null)} />
    </div>
  );
}

// ---------------- Printable report (format TPE/IMS/FR/78) ----------------
export function PdiReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r } = useQuery<PdiReport>({ queryKey: [`/api/pdi/reports/${id}`] });
  if (!r) return <Skeleton className="h-96" />;
  const cols = r.sample;
  const cell = "border border-black px-2 py-1.5";
  const tick = <span className="font-bold text-base leading-none">✓</span>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/quality" onClick={() => { qualityTab.current = "pdi"; }}><Button variant="ghost" size="sm" data-testid="button-back"><ArrowLeft className="h-4 w-4 mr-1" />Quality</Button></Link>
        <StatusBadge status={r.result} />
        <Button className="ml-auto" variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-pdi"><Printer className="h-4 w-4 mr-1" />Print</Button>
      </div>
      <div className="overflow-x-auto">
      <div className="pdi-sheet bg-white text-black mx-auto w-[190mm] min-w-[190mm] p-[6mm] shadow-sm print:shadow-none print:p-0 text-[11pt]" data-testid="pdi-sheet">
        <table className="w-full border-collapse border-2 border-black">
          <tbody>
            <tr>
              <td className={`${cell} border-2 w-[28%] text-center align-bottom`}><div className="font-serif text-[44pt] leading-none">τ</div><div className="text-[8.5pt] font-semibold mt-1 whitespace-nowrap">Tau Power Electronics Pvt. Ltd.</div></td>
              <td className={`${cell} border-2 text-center text-[20pt] font-bold tracking-tight`}>Pre Dispatch Inspection Report</td>
            </tr>
          </tbody>
        </table>
        <table className="w-full border-collapse border-2 border-t-0 border-black text-[10pt]">
          <tbody>
            <tr><td className={`${cell} w-[22%] font-semibold`}>Part Name</td><td className={cell} colSpan={2}>{r.itemName}</td><td className={`${cell} w-[18%] font-semibold`}>Invoice No</td><td className={`${cell} font-mono`} data-testid="pdi-invoice-no">{r.invoiceNo ?? ""}</td></tr>
            <tr><td className={`${cell} font-semibold`}>Part No</td><td className={`${cell} font-mono`} colSpan={2}>{r.itemCode}{r.customerPartNo && <div className="text-[8pt] font-sans">Customer part no. {r.customerPartNo}</div>}</td><td className={`${cell} font-semibold`}>Invoice Qty.</td><td className={`${cell} tabular-nums`}>{String(r.qty).padStart(2, "0")}</td></tr>
            <tr><td className={`${cell} font-semibold`}>Drg. Rev. No &amp; Date:</td><td className={`${cell} w-[8%] text-center`}>{r.drgRev}</td><td className={`${cell} text-center tabular-nums`}>{dmy(r.drgDate)}</td><td className={`${cell} font-semibold`}>Sampling No.</td><td className={`${cell} tabular-nums`}>{String(r.sample).padStart(2, "0")}</td></tr>
            <tr><td className={`${cell} font-semibold`}>Reference Standard</td><td className={`${cell} text-center`} colSpan={2}>{r.refStandard || "-"}</td><td className={`${cell} font-semibold`}>Invoice Date</td><td className={`${cell} tabular-nums`}>{dmy(r.invoiceDate)}</td></tr>
            <tr><td className={`${cell} font-semibold`}>Material Test report</td><td className={cell}>Yes {r.mtr && tick}</td><td className={cell}>No {!r.mtr && tick}</td><td className={`${cell} font-semibold`}>Customer Name</td><td className={cell}>{r.customer}</td></tr>
          </tbody>
        </table>
        <table className="w-full table-fixed border-collapse border-2 border-black text-[10pt] mt-[4mm]">
          <colgroup><col style={{ width: "7%" }} /><col style={{ width: "15%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} />
            {Array.from({ length: cols }, (_, i) => <col key={i} style={{ width: `${35 / cols}%` }} />)}<col style={{ width: "8%" }} /><col style={{ width: "8%" }} /></colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className={cell}>Sr.No.</th><th rowSpan={2} className={cell}>Description</th><th rowSpan={2} className={cell}>Specification</th><th rowSpan={2} className={cell}>Inspection Method</th>
              {Array.from({ length: cols }, (_, i) => <th key={i} rowSpan={2} className={cell}>{i + 1}</th>)}
              <th colSpan={2} className={cell}>Remark</th>
            </tr>
            <tr><th className={`${cell} text-[9pt]`}>Accept</th><th className={`${cell} text-[9pt]`}>Reject</th></tr>
          </thead>
          <tbody>{r.chars.map(c => { const rd = r.readings.find(x => x.sr === c.sr); return (
            <tr key={c.sr} className="text-center">
              <td className={cell}>{c.sr}</td><td className={cell}>{c.description}</td><td className={cell}>{specText(c)}</td><td className={cell}>{c.method}</td>
              {Array.from({ length: cols }, (_, i) => <td key={i} className={`${cell} px-0.5 tabular-nums`}>{rd?.values[i] ?? ""}</td>)}
              <td className={`${cell} font-semibold`}>{rd?.ok ? "OK" : ""}</td><td className={`${cell} font-semibold`}>{rd && !rd.ok ? "NG" : ""}</td>
            </tr>); })}</tbody>
        </table>
        <div className="border-2 border-t-0 border-black min-h-[22mm] p-2 text-[10pt]"><span className="font-semibold">Note If any:</span> {r.note}</div>
        <div className="grid grid-cols-3 border-2 border-t-0 border-black text-[9pt]">
          <div className="p-2 border-r border-black">PDI no. <span className="font-mono">{r.pdiNo}</span><br />Date {dmy(r.date)}</div>
          <div className="p-2 border-r border-black">Inspected by<br /><span className="font-semibold">{r.inspector}</span></div>
          <div className="p-2">Result<br /><span className="font-bold">{r.result === "ACCEPT" ? "ACCEPTED" : "REJECTED"}</span></div>
        </div>
        <div className="text-right text-[8.5pt] font-semibold mt-2">{PDI_DOC}</div>
      </div>
      </div>
    </div>
  );
}

export function usePdiStatus(soId: number | undefined) {
  return useQuery<{ soLineId: number; required: boolean; covered: number }[]>({ queryKey: [`/api/pdi/so/${soId}`], enabled: !!soId }).data ?? [];
}
