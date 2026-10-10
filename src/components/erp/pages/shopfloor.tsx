"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ScanLine, Cpu, AlertOctagon, CheckCircle2, XCircle, AlertCircle, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useApi, useAction } from "@/lib/erp/client";
import { asRole, canEdit } from "@/lib/erp/auth-shared";
import { PageIntro, Empty, StatusBadge, Kpi, SectionCard } from "../shared";

type Board = {
  orders: { order: { id: number; orderNo: string; qty: number; dueDate: string }; item: { code: string; name: string }; ops: { seq: number; name: string; station: string; queued: number; hold: number }[]; done: number; scrap: number; canClose: boolean }[];
  stations: { code: string; name: string; queued: number; hold: number; todayDone: number; todayPass: number }[];
  defects: { defect: string; count: number }[];
  recent: { serial: string; station: string; operator: string; result: string; reason: string | null; ts: string; op: string }[];
};
type UnitInfo = {
  unit: { id: number; serialNo: string; status: "QUEUED" | "HOLD" | "DONE" | "SCRAP"; seq: number; reworkCount: number };
  item: { id: number; code: string; name: string; customerPartNo: string | null };
  order: { id: number; orderNo: string };
  ops: { seq: number; code: string; name: string; station: string; cycleSec: number; params: { key: string; label: string; unit: string; min?: number; max?: number; kind?: "num" | "bool" }[] }[];
  current: { seq: number; code: string; name: string; station: string; params: { key: string; label: string; unit: string; min?: number; max?: number; kind?: "bool" }[] } | null;
} | null;

type Feedback =
  | { kind: "success"; title: string; desc?: string }
  | { kind: "fail"; title: string; desc?: string }
  | { kind: "error"; title: string; desc?: string }
  | null;

export default function ShopFloorPage() {
  const { data: session } = useSession();
  const canMutate = canEdit(asRole(session?.user?.role));
  const board = useApi<Board>("/api/phase3/board");
  const [serial, setSerial] = useState("");
  const [query, setQuery] = useState("");
  const unit = useApi<UnitInfo>(`/api/phase3/unit?no=${encodeURIComponent(query)}`, !!query);
  const [operator, setOperator] = useState("Operator-1");
  const [values, setValues] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const scan = useAction("POST", "/api/phase3/scan", "Scan recorded");
  const disp = useAction("POST", "/api/phase3/disposition", "Disposition applied");

  // Aggregate KPIs from the station board.
  const stations = board.data?.stations ?? [];
  const totalWip = stations.reduce((s, x) => s + x.queued, 0);
  const totalHold = stations.reduce((s, x) => s + x.hold, 0);
  const todayDone = stations.reduce((s, x) => s + x.todayDone, 0);
  const todayPass = stations.reduce((s, x) => s + x.todayPass, 0);
  const fpy = todayDone > 0 ? Math.round((todayPass / todayDone) * 1000) / 10 : 0;

  // Auto-clear the scan feedback a few seconds after it appears.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(t);
  }, [feedback]);

  // Surface "not found" as prominent feedback when the unit lookup resolves
  // empty — the Empty component below still stays as a graceful placeholder.
  useEffect(() => {
    if (query && !unit.isLoading && (unit.data?.notFound || !unit.data)) {
      setFeedback({ kind: "error", title: "Serial not found", desc: `No WIP unit matches “${query}” on the shop floor.` });
    }
  }, [query, unit.isLoading, unit.data]);

  const onLoad = (s: string) => {
    setFeedback(null);
    setQuery(s);
  };

  const onSubmit = () => {
    if (!unit.data?.unit) return;
    setFeedback(null);
    scan.mutate(
      { serialNo: unit.data.unit.serialNo, operator, values } as never,
      {
        onSuccess: (data) => {
          const result = (data as { result?: string } | undefined)?.result;
          if (result === "PASS") {
            setFeedback({ kind: "success", title: "Scan recorded — PASS", desc: `${unit.data!.unit.serialNo} advanced to the next operation.` });
          } else if (result === "FAIL") {
            setFeedback({ kind: "fail", title: "Scan recorded — FAIL", desc: `${unit.data!.unit.serialNo} moved to HOLD for disposition.` });
          }
          setValues({});
          setQuery("");
          setSerial("");
        },
        onError: (e: Error) => {
          setFeedback({ kind: "error", title: "Scan blocked", desc: e.message });
        },
      },
    );
  };

  const onDisp = (action: "REWORK" | "SCRAP") => {
    if (!unit.data?.unit) return;
    setFeedback(null);
    disp.mutate(
      { serialNo: unit.data.unit.serialNo, action, reason: action === "REWORK" ? "Rework to same op" : "Scrap — out of spec" } as never,
      {
        onSuccess: () => {
          setFeedback({
            kind: action === "REWORK" ? "success" : "fail",
            title: action === "REWORK" ? "Rework queued" : "Unit scrapped",
            desc: `${unit.data!.unit.serialNo} → ${action === "REWORK" ? "back to operation" : "scrap"}.`,
          });
          setQuery("");
          setSerial("");
        },
        onError: (e: Error) => setFeedback({ kind: "error", title: "Disposition blocked", desc: e.message }),
      },
    );
  };

  return (
    <>
      <PageIntro>
        MES-lite live board — WIP per station, today&apos;s output and pass rate, top defect reasons. Station terminal scans a serial, validates test limits and routes PASS → next op, FAIL → on hold.
      </PageIntro>

      {/* KPI row — totals from the live station board */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="WIP on the floor" value={String(totalWip)} sub={`${stations.length} stations active`} tone="neutral" />
        <Kpi label="Units on hold" value={String(totalHold)} sub={totalHold > 0 ? "Disposition required" : "All flowing"} tone={totalHold > 0 ? "rose" : "neutral"} />
        <Kpi label="Today&apos;s output" value={String(todayDone)} sub={`${todayPass} passed`} tone="emerald" />
        <Kpi label="First-pass yield" value={todayDone > 0 ? `${fpy}%` : "—"} sub={todayDone > 0 ? `${todayPass}/${todayDone} units` : "No scans yet"} tone={fpy >= 95 ? "emerald" : fpy > 0 ? "amber" : "neutral"} />
      </div>

      {/* Station board */}
      <SectionCard
        title="Stations"
        subtitle="WIP and today&apos;s pass/fail per work cell"
        className="mb-4"
        bodyClassName="p-4"
      >
        {stations.length === 0 ? (
          <Empty>No stations configured</Empty>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stations.map((s) => {
              const idle = s.queued === 0 && s.hold === 0;
              const isHold = s.hold > 0;
              const dotClass = isHold
                ? "bg-amber-500"
                : idle
                  ? "bg-muted-foreground/40"
                  : "bg-emerald-500";
              return (
                <div
                  key={s.code}
                  className="rounded-xl border bg-card shadow-xs p-3 card-hover"
                  title={s.name}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${dotClass}`} aria-hidden />
                    <Cpu className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-mono font-medium truncate">{s.code}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">{s.name}</div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-lg font-semibold tabular-nums">{s.queued}</span>
                    <span className="text-[11px] text-muted-foreground">queued</span>
                    {s.hold > 0 && <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">· {s.hold} hold</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    today {s.todayDone} done · {s.todayPass} pass
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Station terminal */}
        <SectionCard
          title={<span className="flex items-center gap-2"><ScanLine className="h-4 w-4" />Station terminal</span>}
          className="lg:col-span-2"
          bodyClassName="p-5"
        >
          {canMutate ? (
            <>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="Scan / type serial no. (e.g. EGT-2610-00012)"
                  className="font-mono"
                  value={serial}
                  onChange={(e) => {
                    setSerial(e.target.value);
                    if (feedback) setFeedback(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && onLoad(serial)}
                />
                <Button onClick={() => onLoad(serial)}>Load</Button>
              </div>

              {/* Inline scan feedback */}
              {feedback && (
                <Alert
                  variant={feedback.kind === "error" ? "destructive" : "default"}
                  className={`scan-feedback mb-3 ${feedback.kind === "success" ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30" : feedback.kind === "fail" ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30" : ""}`}
                >
                  {feedback.kind === "error" ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : feedback.kind === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                  <AlertTitle>{feedback.title}</AlertTitle>
                  {feedback.desc && <AlertDescription>{feedback.desc}</AlertDescription>}
                </Alert>
              )}

              {!query ? (
                <Empty>Scan a serial to begin</Empty>
              ) : unit.isLoading ? (
                <Skeleton className="h-40" />
              ) : unit.data?.notFound || !unit.data ? (
                <Empty>Serial not found on the shop floor</Empty>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-mono text-sm font-semibold">{unit.data.unit.serialNo}</h3>
                    <StatusBadge status={unit.data.unit.status} />
                    <span className="text-xs text-muted-foreground">{unit.data.item.code} — {unit.data.item.name}</span>
                    {unit.data.unit.reworkCount > 0 && <span className="text-[11px] text-amber-600 font-medium">rework ×{unit.data.unit.reworkCount}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {unit.data.ops.map((o) => {
                      const isCurrent = unit.data!.current?.seq === o.seq;
                      const done = unit.data!.unit.seq > o.seq || unit.data!.unit.status === "DONE";
                      return (
                        <span key={o.seq} className={`text-[11px] rounded px-2 py-1 border ${done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200" : isCurrent ? "bg-accent text-accent-foreground border-accent font-medium" : "bg-muted"}`}>
                          {o.seq} {o.code}
                        </span>
                      );
                    })}
                  </div>
                  {unit.data.current && unit.data.unit.status !== "DONE" && unit.data.unit.status !== "SCRAP" && (
                    <div className="border rounded-lg p-3">
                      <div className="text-xs font-medium mb-2">Operation {unit.data.current.seq} — {unit.data.current.name} @ {unit.data.current.station}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {unit.data.current.params.map((p) => (
                          <div key={p.key}>
                            <Label className="text-xs">{p.label} {p.unit && <span className="text-muted-foreground">({p.unit})</span>}</Label>
                            <Input
                              className="mt-1 h-9"
                              type={p.kind === "bool" ? "text" : "number"}
                              placeholder={p.kind === "bool" ? "OK / NG" : p.min !== undefined && p.max !== undefined ? `${p.min}–${p.max}` : "value"}
                              value={values[p.key] ?? ""}
                              onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Input className="w-40" placeholder="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} />
                        <Button onClick={onSubmit} disabled={scan.isPending}>Submit scan</Button>
                      </div>
                    </div>
                  )}
                  {unit.data.unit.status === "HOLD" && (
                    <div className="border border-destructive/40 rounded-lg p-3 bg-red-50/40 dark:bg-red-950/20">
                      <div className="text-xs font-medium text-destructive mb-2 flex items-center gap-1">
                        <AlertOctagon className="h-3.5 w-3.5" />Unit on hold — disposition required
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onDisp("REWORK")} disabled={disp.isPending}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Rework
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => onDisp("SCRAP")} disabled={disp.isPending}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />Scrap
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center text-center gap-2 py-8">
              <ShieldAlert className="h-7 w-7 text-muted-foreground" />
              <h3 className="text-sm font-medium">Scan terminal — operators only</h3>
              <p className="text-xs text-muted-foreground max-w-md">
                You have read-only access. The board, KPIs and recent scans remain visible, but the
                station scan / disposition terminal is restricted to operators and administrators.
              </p>
            </div>
          )}
        </SectionCard>

        {/* Defects + recent */}
        <div className="space-y-4">
          <SectionCard title="Top defect reasons" bodyClassName="p-4">
            {(board.data?.defects ?? []).length === 0 ? (
              <Empty>No defects logged</Empty>
            ) : (
              <ul className="space-y-1.5">
                {(board.data?.defects ?? []).slice(0, 6).map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground w-4 tabular-nums">{i + 1}</span>
                    <span className="flex-1 truncate">{d.defect}</span>
                    <span className="text-xs font-mono tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Latest scans" subtitle="Last 12" bodyClassName="p-4">
            <div className="max-h-72 overflow-y-auto scroll-thin">
              {(board.data?.recent ?? []).length === 0 ? (
                <Empty>
                  <span className="flex flex-col items-center gap-1">
                    <ScanLine className="h-5 w-5 opacity-40" aria-hidden />
                    No scans yet
                  </span>
                </Empty>
              ) : (
                <table className="zebra table-compact w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                      <th className="font-medium px-2 py-1.5 text-left">Serial</th>
                      <th className="font-medium px-2 py-1.5 text-left">Station</th>
                      <th className="font-medium px-2 py-1.5 text-left">Result</th>
                      <th className="font-medium px-2 py-1.5 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(board.data?.recent ?? []).slice(0, 12).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-1.5 font-mono">{r.serial.slice(-8)}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.station}</td>
                        <td className="px-2 py-1.5"><StatusBadge status={r.result} /></td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.ts.slice(11, 16)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Orders on the floor */}
      <SectionCard
        title="Orders on the shop floor"
        className="mt-4"
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {(board.data?.orders ?? []).length === 0 ? (
          <Empty>No active orders</Empty>
        ) : (
          <table className="zebra w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {["Order", "Product", "Progress (ops)", "Done", "Scrap", ""].map((h, i) => (
                  <th key={i} className={`font-medium px-5 py-2 ${(i === 3 || i === 4) ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(board.data?.orders ?? []).map((o) => (
                <tr key={o.order.id} className="border-b last:border-0">
                  <td className="px-5 py-2 font-mono text-xs">{o.order.orderNo}</td>
                  <td className="px-5"><span className="font-mono text-xs">{o.item.code}</span></td>
                  <td className="px-5">
                    <div className="flex flex-wrap gap-1">
                      {o.ops.map((op) => (
                        <span key={op.seq} className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                          {op.station}: {op.queued}q{op.hold ? `/${op.hold}h` : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{o.done}</td>
                  <td className="px-5 text-right tabular-nums text-destructive">{o.scrap}</td>
                  <td className="px-5 text-right">{o.canClose && <span className="text-xs text-primary">Ready to close →</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
