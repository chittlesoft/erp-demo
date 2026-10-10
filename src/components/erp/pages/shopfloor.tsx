"use client";
import { useState } from "react";
import { ScanLine, Cpu, AlertOctagon, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useAction } from "@/lib/erp/client";
import { PageIntro, Empty, StatusBadge } from "../shared";

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

export default function ShopFloorPage() {
  const board = useApi<Board>("/api/phase3/board");
  const [serial, setSerial] = useState("");
  const [query, setQuery] = useState("");
  const unit = useApi<UnitInfo>(`/api/phase3/unit?no=${encodeURIComponent(query)}`, !!query);
  const [operator, setOperator] = useState("Operator-1");
  const [values, setValues] = useState<Record<string, string>>({});
  const scan = useAction("POST", "/api/phase3/scan", "Scan recorded");
  const disp = useAction("POST", "/api/phase3/disposition", "Disposition applied");

  return (
    <>
      <PageIntro>
        MES-lite live board — WIP per station, today&apos;s output and pass rate, top defect reasons. Station terminal scans a serial, validates test limits and routes PASS → next op, FAIL → on hold.
      </PageIntro>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        {(board.data?.stations ?? []).map((s) => (
          <div key={s.code} className="rounded-xl border bg-card shadow-xs p-3">
            <div className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-mono font-medium">{s.code}</span></div>
            <div className="text-[11px] text-muted-foreground truncate">{s.name}</div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">{s.queued}</span><span className="text-[11px] text-muted-foreground">queued</span>
              {s.hold > 0 && <span className="text-[11px] text-destructive font-medium">· {s.hold} hold</span>}
            </div>
            <div className="text-[11px] text-muted-foreground">today {s.todayDone} done · {s.todayPass} pass</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Station terminal */}
        <div className="lg:col-span-2 rounded-xl border bg-card shadow-xs p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><ScanLine className="h-4 w-4" />Station terminal</h2>
          <div className="flex gap-2 mb-4">
            <Input placeholder="Scan / type serial no. (e.g. EGT-2610-00012)" className="font-mono" value={serial} onChange={(e) => setSerial(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuery(serial)} />
            <Button onClick={() => setQuery(serial)}>Load</Button>
          </div>
          {!query ? <Empty>Scan a serial to begin</Empty> :
            unit.isLoading ? <Skeleton className="h-40" /> :
            unit.data?.notFound || !unit.data ? <Empty>Serial not found on the shop floor</Empty> : (
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
                    return <span key={o.seq} className={`text-[11px] rounded px-2 py-1 border ${done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200" : isCurrent ? "bg-accent text-accent-foreground border-accent font-medium" : "bg-muted"}`}>{o.seq} {o.code}</span>;
                  })}
                </div>
                {unit.data.current && unit.data.unit.status !== "DONE" && unit.data.unit.status !== "SCRAP" && (
                  <div className="border rounded-lg p-3">
                    <div className="text-xs font-medium mb-2">Operation {unit.data.current.seq} — {unit.data.current.name} @ {unit.data.current.station}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {unit.data.current.params.map((p) => (
                        <div key={p.key}>
                          <Label className="text-xs">{p.label} {p.unit && <span className="text-muted-foreground">({p.unit})</span>}</Label>
                          <Input className="mt-1 h-9" type={p.kind === "bool" ? "text" : "number"} placeholder={p.kind === "bool" ? "OK / NG" : p.min !== undefined && p.max !== undefined ? `${p.min}–${p.max}` : "value"} value={values[p.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Input className="w-40" placeholder="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} />
                      <Button onClick={() => scan.mutate({ serialNo: unit.data!.unit.serialNo, operator, values } as never, { onSuccess: () => { setValues({}); setQuery(""); setSerial(""); } })} disabled={scan.isPending}>Submit scan</Button>
                    </div>
                  </div>
                )}
                {unit.data.unit.status === "HOLD" && (
                  <div className="border border-destructive/40 rounded-lg p-3 bg-red-50/40 dark:bg-red-950/20">
                    <div className="text-xs font-medium text-destructive mb-2 flex items-center gap-1"><AlertOctagon className="h-3.5 w-3.5" />Unit on hold — disposition required</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => disp.mutate({ serialNo: unit.data!.unit.serialNo, action: "REWORK", reason: "Rework to same op" } as never, { onSuccess: () => { setQuery(""); setSerial(""); } })}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Rework</Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => disp.mutate({ serialNo: unit.data!.unit.serialNo, action: "SCRAP", reason: "Scrap — out of spec" } as never, { onSuccess: () => { setQuery(""); setSerial(""); } })}><XCircle className="h-3.5 w-3.5 mr-1" />Scrap</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Defects + recent */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card shadow-xs p-4">
            <h2 className="text-sm font-semibold mb-2">Top defect reasons</h2>
            {(board.data?.defects ?? []).length === 0 ? <Empty>No defects logged</Empty> : (
              <ul className="space-y-1.5">{(board.data?.defects ?? []).slice(0, 6).map((d, i) => <li key={i} className="flex items-center gap-2 text-sm"><span className="text-xs text-muted-foreground w-4">{i + 1}</span><span className="flex-1 truncate">{d.defect}</span><span className="text-xs font-mono tabular-nums">{d.count}</span></li>)}</ul>
            )}
          </div>
          <div className="rounded-xl border bg-card shadow-xs p-4">
            <h2 className="text-sm font-semibold mb-2">Latest scans</h2>
            <div className="max-h-72 overflow-y-auto scroll-thin space-y-1.5">
              {(board.data?.recent ?? []).slice(0, 12).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono">{r.serial.slice(-8)}</span>
                  <span className="text-muted-foreground">@ {r.station}</span>
                  <StatusBadge status={r.result} />
                  <span className="ml-auto text-muted-foreground">{r.ts.slice(11, 16)}</span>
                </div>
              ))}
              {(board.data?.recent ?? []).length === 0 && <Empty>No scans yet</Empty>}
            </div>
          </div>
        </div>
      </div>

      {/* Orders on the floor */}
      <div className="rounded-xl border bg-card shadow-xs mt-4">
        <div className="px-5 pt-4 pb-2"><h2 className="text-sm font-semibold">Orders on the shop floor</h2></div>
        <div className="overflow-x-auto scroll-thin">
          {(board.data?.orders ?? []).length === 0 ? <Empty>No active orders</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b">{["Order", "Product", "Progress (ops)", "Done", "Scrap", ""].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${(i === 3 || i === 4) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {(board.data?.orders ?? []).map((o) => (
                  <tr key={o.order.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-2 font-mono text-xs">{o.order.orderNo}</td>
                    <td className="px-5"><span className="font-mono text-xs">{o.item.code}</span></td>
                    <td className="px-5"><div className="flex flex-wrap gap-1">{o.ops.map((op) => <span key={op.seq} className="text-[10px] rounded bg-muted px-1.5 py-0.5">{op.station}: {op.queued}q{op.hold ? `/${op.hold}h` : ""}</span>)}</div></td>
                    <td className="px-5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{o.done}</td>
                    <td className="px-5 text-right tabular-nums text-destructive">{o.scrap}</td>
                    <td className="px-5 text-right">{o.canClose && <span className="text-xs text-primary">Ready to close →</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
