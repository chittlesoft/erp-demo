import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanLine, FlaskConical, Wrench, Trash2, Upload, CheckCircle2, XCircle, CircleDot, Circle, FileSpreadsheet, Save, Tag, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, API_BASE } from "@/lib/queryClient";
import { LabelsDialog, type SerialLabel } from "@/components/labels";
import { useAction, useStations, simulateValues, limitText, inLimit, type Board, type UnitInfo, type RouteOp, type Param } from "@/lib/erp";
import { PageIntro, StatusBadge, Empty } from "@/components/layout";

async function post<T = any>(url: string, body: unknown): Promise<T> {
  const res = await apiRequest("POST", url, body);
  return res.json();
}
const errMsg = (e: any) => { let m = String(e?.message ?? e).replace(/^\d+:\s*/, ""); try { m = JSON.parse(m).message ?? m; } catch {} return m; };

// ---------------- Serial labels ----------------
type OrderSerials = { orderNo: string; itemCode: string; itemName: string; customerPartNo: string | null; date: string; serials: { serial: string; status: string }[] };
export function SerialLabelsButton({ orderId, size = "sm" }: { orderId: number; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  const q = useQuery<OrderSerials>({ queryKey: [`/api/mes/order/${orderId}/serials`], enabled: open });
  const d = q.data;
  const labels: SerialLabel[] = d ? d.serials.map(s => ({ serial: s.serial, itemCode: d.itemCode, itemName: d.itemName, customerPartNo: d.customerPartNo, orderNo: d.orderNo, date: d.date })) : [];
  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)} data-testid={`button-labels-${orderId}`}><Tag className="h-3.5 w-3.5 mr-1" />Labels</Button>
      <LabelsDialog open={open && !!d} onClose={() => setOpen(false)} title={`Serial labels — ${d?.orderNo ?? ""}`} description={d ? `${d.itemCode} · ${d.itemName}. Scrapped units are excluded.` : undefined} serials={labels} />
    </>
  );
}

// ---------------- Live board ----------------
function LiveBoard() {
  const { data } = useQuery<Board>({ queryKey: ["/api/mes/board"], refetchInterval: 15000 });
  const close = useAction<number>("POST", id => `/api/mes/close/${id}`, "Order closed — good units posted to finished goods with serials");
  if (!data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.stations.map(s => (
          <Card key={s.code} data-testid={`card-station-${s.code}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold">{s.code}</span>{s.hold > 0 && <span className="text-[10px] rounded bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.5 font-medium">{s.hold} on hold</span>}</div>
              <div className="text-[11px] text-muted-foreground truncate" title={s.name}>{s.name}</div>
              <div className="mt-2 flex items-baseline gap-1"><span className="text-xl font-semibold tabular-nums">{s.queued}</span><span className="text-[11px] text-muted-foreground">waiting</span></div>
              <div className="text-[11px] text-muted-foreground tabular-nums">Today {s.todayDone} done{s.todayDone ? ` · ${Math.round((s.todayPass / s.todayDone) * 100)}% pass` : ""}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Orders on the shop floor</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {data.orders.length === 0 ? <Empty>No orders released. Start an order in Production, then release it to the shop floor.</Empty> : data.orders.map(o => {
            const total = o.order.qty;
            return (
              <div key={o.order.id} data-testid={`board-order-${o.order.id}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                  <span className="font-mono text-xs">{o.order.orderNo}</span>
                  <span className="text-sm font-medium">{o.item.name}</span>
                  <span className="text-xs text-muted-foreground">{total} units · due {o.order.dueDate}</span>
                  <span className="text-xs text-muted-foreground">FPY <b className="text-foreground tabular-nums">{o.fpy ?? "—"}{o.fpy != null && "%"}</b></span>
                  <div className="ml-auto flex items-center gap-2"><SerialLabelsButton orderId={o.order.id} />{o.canClose ? <Button size="sm" onClick={() => close.mutate(o.order.id)} disabled={close.isPending} data-testid={`button-close-order-${o.order.id}`}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Close order</Button>
                    : <span className="text-[11px] text-muted-foreground">{o.done} done · {o.scrap} scrap · {total - o.done - o.scrap} in process</span>}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {o.ops.map(op => (
                    <div key={op.seq} className="rounded border p-2 min-w-[112px] flex-1 basis-0" title={op.name}>
                      <div className="text-[10px] text-muted-foreground font-mono">{op.seq} · {op.station}</div>
                      <div className="text-[11px] truncate">{op.name}</div>
                      <div className="mt-1 flex items-baseline gap-2"><span className="text-base font-semibold tabular-nums">{op.queued}</span>{op.hold > 0 && <span className="text-[11px] text-destructive font-medium">{op.hold} hold</span>}</div>
                      <div className="h-1 rounded bg-muted mt-1 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, ((op.queued + op.hold) / total) * 100)}%` }} /></div>
                    </div>
                  ))}
                  <div className="rounded border p-2 min-w-[112px] flex-1 basis-0 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900">
                    <div className="text-[10px] text-muted-foreground">Finished</div><div className="text-[11px]">Ready for FG</div>
                    <div className="mt-1 flex items-baseline gap-2"><span className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{o.done}</span>{o.scrap > 0 && <span className="text-[11px] text-destructive">{o.scrap} scrap</span>}</div>
                    <div className="h-1 rounded bg-muted mt-1 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${(o.done / total) * 100}%` }} /></div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top test failures</CardTitle></CardHeader>
          <CardContent>{data.defects.length === 0 ? <Empty>No failures recorded</Empty> : data.defects.map(d => (
            <div key={d.defect} className="flex items-center gap-2 py-1 text-sm"><span className="flex-1 truncate">{d.defect}</span><span className="tabular-nums font-medium">{d.count}</span></div>))}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Latest scans</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs"><tbody>{data.recent.map((r, i) => (
              <tr key={i} className="border-t"><td className="px-4 py-1.5 font-mono">{r.serial}</td><td className="px-2 font-mono">{r.station}</td><td className="px-2">{r.operator}</td><td className="px-2"><StatusBadge status={r.result} /></td><td className="px-2 text-muted-foreground truncate max-w-[220px]">{r.reason ?? ""}</td><td className="px-4 text-right tabular-nums text-muted-foreground">{r.ts.slice(11, 16)}</td></tr>))}</tbody></table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Station terminal ----------------
function ParamInput({ p, value, onChange }: { p: Param; value: any; onChange: (v: any) => void }) {
  const ok = inLimit(p, value);
  if (p.kind === "bool") return (
    <label className="flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer">
      <Checkbox checked={value === true} onCheckedChange={v => onChange(v === true)} data-testid={`check-param-${p.key}`} />{p.label}
    </label>
  );
  return (
    <div className="space-y-1">
      <Label className="text-xs">{p.label} <span className="text-muted-foreground font-normal">({limitText(p)})</span></Label>
      <Input inputMode="decimal" value={value ?? ""} onChange={e => onChange(e.target.value)} data-testid={`input-param-${p.key}`}
        className={ok === false ? "border-destructive focus-visible:ring-destructive" : ok ? "border-emerald-500" : ""} />
    </div>
  );
}

function RouteSteps({ info }: { info: NonNullable<UnitInfo> }) {
  const { unit, ops } = info;
  return (
    <ol className="flex flex-wrap gap-1.5">
      {ops.map(op => {
        const done = unit.status === "DONE" || op.seq < unit.seq;
        const cur = op.seq === unit.seq && unit.status !== "DONE";
        return (
          <li key={op.seq} className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${cur ? (unit.status === "HOLD" ? "border-destructive bg-red-50 dark:bg-red-950/30" : "border-primary bg-primary/5") : ""}`}>
            {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : cur ? (unit.status === "HOLD" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <CircleDot className="h-3.5 w-3.5 text-primary" />) : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="font-mono">{op.seq}</span><span className="hidden sm:inline">{op.station}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Terminal() {
  const stations = useStations().data ?? {};
  const { toast } = useToast();
  const [station, setStation] = useState("CAL");
  const [operator, setOperator] = useState("A. Shinde");
  const [scan, setScan] = useState("");
  const [serial, setSerial] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, any>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ serial: string; result: string; text: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const queue = useQuery<{ serial: string; status: string; itemCode: string; orderNo: string; reworks: number }[]>({ queryKey: ["/api/mes/queue", station] });
  const unit = useQuery<UnitInfo>({ queryKey: ["/api/mes/unit", serial ?? ""], enabled: !!serial });
  const info = unit.data;
  const cur = info?.current;
  const wrongStation = !!(info && cur && info.unit.status === "QUEUED" && cur.station !== station);
  useEffect(() => { setVals({}); setReason(""); }, [serial, info?.unit.seq, info?.unit.status]);

  const load = (s: string) => { const v = s.trim().toUpperCase(); if (v) { setSerial(v); setScan(""); } };
  const refresh = () => { queryClient.invalidateQueries(); };
  const submit = async () => {
    if (!info || !cur) return;
    setBusy(true);
    try {
      const r = await post<{ result: string; failures: string[]; next: string }>("/api/mes/scan", { serial: info.unit.serial_no, station, operator, values: vals });
      setLast({ serial: info.unit.serial_no, result: r.result, text: r.result === "PASS" ? `Next: ${r.next}` : r.failures.join("; ") });
      toast({ title: `${info.unit.serial_no}: ${r.result}`, description: r.result === "PASS" ? r.next : r.failures.join("; "), variant: r.result === "PASS" ? undefined : "destructive" });
      refresh();
      if (r.result === "PASS") { setSerial(null); setTimeout(() => scanRef.current?.focus(), 50); }
    } catch (e) { toast({ title: "Scan blocked", description: errMsg(e), variant: "destructive" }); }
    setBusy(false);
  };
  const dispose = async (action: "REWORK" | "SCRAP") => {
    if (!info) return;
    setBusy(true);
    try { await post("/api/mes/disposition", { serial: info.unit.serial_no, action, reason, operator }); toast({ title: action === "REWORK" ? "Sent for rework — retest at the same station" : "Unit scrapped — NCR raised" }); refresh(); }
    catch (e) { toast({ title: "Action blocked", description: errMsg(e), variant: "destructive" }); }
    setBusy(false);
  };

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="space-y-4 min-w-0">
        <Card>
          <CardContent className="p-4 grid sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Station</Label>
              <Select value={station} onValueChange={v => { setStation(v); setSerial(null); }}><SelectTrigger data-testid="select-station"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(stations).map(([c, n]) => <SelectItem key={c} value={c}>{c} — {n}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Operator</Label><Input value={operator} onChange={e => setOperator(e.target.value)} data-testid="input-operator" /></div>
            <form className="space-y-1" onSubmit={e => { e.preventDefault(); load(scan); }}>
              <Label>Scan serial</Label>
              <div className="flex gap-2"><Input ref={scanRef} autoFocus placeholder="EGT-2610-00071" value={scan} onChange={e => setScan(e.target.value)} className="font-mono" data-testid="input-scan" />
                <Button type="submit" size="icon" aria-label="Load serial" data-testid="button-scan"><ScanLine className="h-4 w-4" /></Button></div>
            </form>
          </CardContent>
        </Card>

        {last && <div className={`rounded-md border px-4 py-2 text-sm ${last.result === "PASS" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-destructive/50 bg-red-50 dark:bg-red-950/30"}`} data-testid="text-last-result">
          <span className="font-mono">{last.serial}</span> — <b>{last.result}</b> · {last.text}</div>}

        {!serial ? <Card><Empty>Scan or pick a serial from the station queue</Empty></Card> : unit.isLoading ? <Skeleton className="h-56" /> : !info ? (
          <Card><Empty>Serial {serial} is not on the shop floor. Finished sensors are in Traceability.</Empty></Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-mono text-base" data-testid="text-unit-serial">{info.unit.serial_no}</CardTitle>
                <StatusBadge status={info.unit.status} />
                {info.unit.rework_count > 0 && <span className="text-[11px] text-muted-foreground">rework ×{info.unit.rework_count}</span>}
                <span className="text-xs text-muted-foreground ml-auto">{info.item.code} · {info.order.orderNo}{info.item.customerPartNo ? ` · OEM ${info.item.customerPartNo}` : ""}</span>
              </div>
              <div className="pt-2"><RouteSteps info={info} /></div>
            </CardHeader>
            <CardContent className="space-y-4">
              {info.unit.status === "DONE" && <p className="text-sm">All operations complete. The unit is posted to finished goods when the order is closed.</p>}
              {info.unit.status === "SCRAP" && <p className="text-sm text-destructive">Scrapped. An NCR was raised.</p>}
              {cur && info.unit.status === "QUEUED" && (
                wrongStation ? (
                  <div className="rounded-md border border-destructive/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm" data-testid="text-wrong-station">
                    Wrong station. This unit is waiting at <b>op {cur.seq} {cur.name}</b> ({cur.station}). Operations cannot be skipped.
                  </div>
                ) : (
                  <>
                    <div><div className="text-sm font-medium">Op {cur.seq}: {cur.name}</div><div className="text-xs text-muted-foreground">Standard cycle {cur.cycleSec}s</div></div>
                    {cur.params.length > 0 ? (
                      <div className="grid sm:grid-cols-2 gap-3">{cur.params.map(p => <ParamInput key={p.key} p={p} value={vals[p.key]} onChange={v => setVals(s => ({ ...s, [p.key]: v }))} />)}</div>
                    ) : <p className="text-sm text-muted-foreground">No measurements at this operation — confirm the operation is complete.</p>}
                    <div className="flex flex-wrap gap-2">
                      {cur.params.length > 0 && <Button type="button" variant="outline" onClick={() => setVals(simulateValues(cur.params, 0.08))} data-testid="button-simulate"><FlaskConical className="h-4 w-4 mr-1" />Fill from test bench (demo)</Button>}
                      <Button onClick={submit} disabled={busy || !operator.trim()} data-testid="button-record-op"><CheckCircle2 className="h-4 w-4 mr-1" />{cur.params.length ? "Record result" : "Confirm operation"}</Button>
                    </div>
                  </>
                )
              )}
              {cur && info.unit.status === "HOLD" && (
                <div className="space-y-3 rounded-md border border-destructive/40 p-3">
                  <div className="text-sm"><b>Failed at op {cur.seq} {cur.name}.</b> {info.logs.filter(l => l.result === "FAIL").slice(-1)[0]?.reason}</div>
                  <div className="space-y-1"><Label>Reason / defect</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Re-seat thermocouple junction" data-testid="input-disposition-reason" /></div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => dispose("REWORK")} disabled={busy} data-testid="button-rework"><Wrench className="h-4 w-4 mr-1" />Rework &amp; retest</Button>
                    <Button variant="destructive" onClick={() => dispose("SCRAP")} disabled={busy} data-testid="button-scrap"><Trash2 className="h-4 w-4 mr-1" />Scrap</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Maximum 2 rework attempts per unit. Scrap raises an NCR automatically.</p>
                </div>
              )}
              {info.logs.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">History</div>
                  <table className="w-full text-xs"><tbody>{info.logs.map(l => (
                    <tr key={l.id} className="border-t"><td className="py-1 font-mono">{l.seq}</td><td className="font-mono">{l.station}</td><td>{l.operator}</td><td><StatusBadge status={l.result} /></td>
                      <td className="text-muted-foreground">{Object.entries(l.data).map(([k, v]) => `${k}=${v === true ? "OK" : v}`).join(" · ") || l.reason || ""}</td><td className="text-right tabular-nums text-muted-foreground">{l.ts.slice(5, 16)}</td></tr>))}</tbody></table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <CsvImport station={station} operator={operator} queue={queue.data ?? []} />
      </div>
      <Card className="self-start">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Waiting at {station}</CardTitle></CardHeader>
        <CardContent className="p-0 max-h-[520px] overflow-y-auto">
          {!queue.data ? <div className="p-4"><Skeleton className="h-24" /></div> : queue.data.length === 0 ? <Empty>No units waiting</Empty> : queue.data.map(q => (
            <button key={q.serial} onClick={() => load(q.serial)} className={`w-full flex items-center gap-2 px-4 py-1.5 border-t text-left hover:bg-muted/50 ${serial === q.serial ? "bg-muted" : ""}`} data-testid={`button-queue-${q.serial}`}>
              <span className="font-mono text-xs">{q.serial}</span>{q.status === "HOLD" && <StatusBadge status="HOLD" />}<span className="ml-auto text-[11px] text-muted-foreground">{q.itemCode}</span>
            </button>))}
        </CardContent>
      </Card>
    </div>
  );
}

function CsvImport({ station, operator, queue }: { station: string; operator: string; queue: { serial: string; status: string; itemCode: string }[] }) {
  const { toast } = useToast();
  const routings = useQuery<{ itemId: number; code: string; ops: RouteOp[] }[]>({ queryKey: ["/api/mes/routings"] }).data ?? [];
  const [csv, setCsv] = useState("");
  const [res, setRes] = useState<{ processed: number; pass: number; fail: number; errors: number; results: { serial: string; result: string; message: string }[] } | null>(null);
  const waiting = queue.filter(q => q.status === "QUEUED");
  const op = useMemo(() => { const r = routings.find(r => r.code === waiting[0]?.itemCode); return r?.ops.find(o => o.station === station); }, [routings, waiting, station]);
  const demo = () => {
    if (!op) return;
    const head = ["serial", ...op.params.map(p => p.key)];
    const rows = waiting.slice(0, 10).map(q => { const v = simulateValues(op.params, 0.03); return [q.serial, ...op.params.map(p => (p.kind === "bool" ? "OK" : v[p.key]))].join(","); });
    setCsv([head.join(","), ...rows].join("\n"));
  };
  const run = async () => {
    try { const r = await post("/api/mes/import", { station, operator, csv }); setRes(r); queryClient.invalidateQueries(); toast({ title: `Imported ${r.processed} rows`, description: `${r.pass} pass · ${r.fail} fail · ${r.errors} errors` }); }
    catch (e) { toast({ title: "Import failed", description: errMsg(e), variant: "destructive" }); }
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Bulk import test results (CSV / Excel export)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Header row: <span className="font-mono">serial</span> plus parameter keys{op ? <> — for {station}: <span className="font-mono">{op.params.map(p => p.key).join(", ") || "(no measurements)"}</span></> : ""}. Comma, semicolon or tab separated. Each row is checked against the routing limits and the "no skipping" rule. The template lists every unit waiting here; lines starting with # are ignored.</p>
        <Textarea rows={5} value={csv} onChange={e => setCsv(e.target.value)} className="font-mono text-xs" placeholder={"serial,acc600,cjc,ins\nEGT-2610-00101,1.8,0.2,240"} data-testid="textarea-csv" />
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex"><input type="file" accept=".csv,.txt" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} data-testid="input-csv-file" />
            <span className="inline-flex items-center rounded-md border px-3 h-9 text-sm cursor-pointer hover:bg-muted"><Upload className="h-4 w-4 mr-1" />Choose file</span></label>
          <a href={`${API_BASE}/api/mes/csv-template/${station}`} target="_blank" rel="noopener noreferrer" className={!waiting.length ? "pointer-events-none opacity-50" : ""} aria-disabled={!waiting.length}><Button variant="outline" type="button" tabIndex={-1} data-testid="button-csv-template"><Download className="h-4 w-4 mr-1" />Template for waiting units</Button></a>
          <Button variant="outline" onClick={demo} disabled={!op || !waiting.length} data-testid="button-demo-csv"><FlaskConical className="h-4 w-4 mr-1" />Sample from queue (demo)</Button>
          <Button onClick={run} disabled={!csv.trim() || !operator.trim()} data-testid="button-import-csv">Import</Button>
        </div>
        {res && <table className="w-full text-xs" data-testid="table-import-results"><tbody>{res.results.map((r, i) => (
          <tr key={i} className="border-t"><td className="py-1 font-mono">{r.serial}</td><td><StatusBadge status={r.result} /></td><td className="text-muted-foreground">{r.message}</td></tr>))}</tbody></table>}
      </CardContent>
    </Card>
  );
}

// ---------------- Routings ----------------
function Routings() {
  const { data } = useQuery<{ itemId: number; code: string; name: string; ops: RouteOp[] }[]>({ queryKey: ["/api/mes/routings"] });
  const [itemId, setItemId] = useState<string>("");
  const r = data?.find(d => String(d.itemId) === itemId) ?? data?.find(d => d.ops.length);
  return (
    <Card>
      <div className="p-3 border-b flex flex-wrap items-center gap-3">
        <Select value={r ? String(r.itemId) : ""} onValueChange={setItemId}><SelectTrigger className="w-80" data-testid="select-routing-item"><SelectValue placeholder="Choose sensor" /></SelectTrigger>
          <SelectContent>{(data ?? []).map(d => <SelectItem key={d.itemId} value={String(d.itemId)}>{d.code} — {d.name}</SelectItem>)}</SelectContent></Select>
        <span className="text-xs text-muted-foreground">Limits are illustrative. Replace them with your control plan values; changes apply to the next scan.</span>
      </div>
      <CardContent className="p-0 overflow-x-auto">
        {!r ? <Empty>No routing</Empty> : r.ops.length === 0 ? <Empty>No routing defined for this item</Empty> : (
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Op</th><th className="text-left font-medium px-3">Operation</th><th className="text-left font-medium px-3">Station</th><th className="text-right font-medium px-3">Cycle</th><th className="text-left font-medium px-3">Measurements &amp; limits</th></tr></thead>
            <tbody>{r.ops.map(op => (
              <tr key={op.seq} className="border-b align-top"><td className="px-4 py-2 font-mono text-xs">{op.seq}</td><td className="px-3 py-2">{op.name}</td><td className="px-3 py-2 font-mono text-xs">{op.station}</td><td className="px-3 py-2 text-right tabular-nums text-xs">{op.cycleSec}s</td>
                <td className="px-3 py-2">{op.params.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : <div className="space-y-1.5">{op.params.map(p => <LimitRow key={p.key} itemId={r.itemId} seq={op.seq} p={p} />)}</div>}</td></tr>))}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
function LimitRow({ itemId, seq, p }: { itemId: number; seq: number; p: Param }) {
  const [min, setMin] = useState(p.min?.toString() ?? ""); const [max, setMax] = useState(p.max?.toString() ?? "");
  const save = useAction("PATCH", `/api/mes/routings/${itemId}/${seq}`, "Limits updated");
  if (p.kind === "bool") return <div className="text-xs"><span className="font-mono text-muted-foreground mr-2">{p.key}</span>{p.label} — must be OK</div>;
  const dirty = min !== (p.min?.toString() ?? "") || max !== (p.max?.toString() ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-mono text-muted-foreground w-16">{p.key}</span><span className="w-48">{p.label} ({p.unit})</span>
      <Input className="h-7 w-20 text-xs" placeholder="min" value={min} onChange={e => setMin(e.target.value)} data-testid={`input-min-${seq}-${p.key}`} />
      <Input className="h-7 w-20 text-xs" placeholder="max" value={max} onChange={e => setMax(e.target.value)} data-testid={`input-max-${seq}-${p.key}`} />
      {dirty && <Button size="sm" className="h-7" onClick={() => save.mutate({ key: p.key, min: min === "" ? null : +min, max: max === "" ? null : +max })} data-testid={`button-save-limit-${seq}-${p.key}`}><Save className="h-3 w-3 mr-1" />Save</Button>}
    </div>
  );
}

export default function ShopFloor() {
  return (
    <>
      <PageIntro>Every serial follows its product routing. Scan at each station, record test values or upload them as CSV, and failures go on hold for rework or scrap. A unit cannot skip an operation.</PageIntro>
      <Tabs defaultValue="board">
        <TabsList><TabsTrigger value="board" data-testid="tab-board">Live board</TabsTrigger><TabsTrigger value="terminal" data-testid="tab-terminal">Station terminal</TabsTrigger><TabsTrigger value="routings" data-testid="tab-routings">Routings &amp; limits</TabsTrigger></TabsList>
        <TabsContent value="board"><LiveBoard /></TabsContent>
        <TabsContent value="terminal"><Terminal /></TabsContent>
        <TabsContent value="routings"><Routings /></TabsContent>
      </Tabs>
    </>
  );
}
