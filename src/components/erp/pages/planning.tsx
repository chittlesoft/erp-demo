"use client";
import { useApi, qty } from "@/lib/erp/client";
import type { Requirement } from "@/lib/erp/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro, Empty, SectionCard } from "../shared";
import { AlertTriangle } from "lucide-react";

export default function PlanningPage() {
  const { data, isLoading } = useApi<Requirement[]>("/api/mrp");
  const shortages = (data ?? []).filter((r) => r.shortage > 0);
  return (
    <>
      <PageIntro>
        Multi-level MRP — gross requirements from planned orders, netted against free stock (QC quarantine and job-worker stock excluded). Indent the shortages to purchasing.
      </PageIntro>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Components required</div><div className="text-2xl font-semibold tabular-nums mt-1">{data?.length ?? 0}</div></div>
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">With shortages</div><div className="text-2xl font-semibold tabular-nums mt-1 text-destructive">{shortages.length}</div></div>
        <div className="rounded-xl border bg-card shadow-xs p-4"><div className="text-xs text-muted-foreground">Total short qty</div><div className="text-2xl font-semibold tabular-nums mt-1">{qty(shortages.reduce((s, r) => s + r.shortage, 0))}</div></div>
      </div>
      <SectionCard
        title="MRP requirements"
        subtitle="Net shortages highlighted in amber — indent these to purchasing"
        right={
          data && data.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {data.length} component{data.length === 1 ? "" : "s"} · {shortages.length} short
            </span>
          ) : undefined
        }
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : (data ?? []).length === 0 ? (
          <Empty>No planned orders — nothing to plan</Empty>
        ) : (
          <table className="zebra w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">
              {["Component", "Required", "Available", "Shortage"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i >= 1 ? "text-right" : "text-left"}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.itemId} className={`border-b last:border-0 ${r.shortage > 0 ? "row-warn" : ""}`}>
                  <td className="px-5 py-2"><span className="font-mono text-xs">{r.code}</span><span className="text-xs text-muted-foreground block">{r.name}</span></td>
                  <td className="px-5 text-right tabular-nums">{qty(r.required)} {r.uom}</td>
                  <td className="px-5 text-right tabular-nums">{qty(r.available)}</td>
                  <td className="px-5 text-right tabular-nums">
                    {r.shortage > 0 ? <span className="text-destructive font-semibold inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{qty(r.shortage)} {r.uom}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
