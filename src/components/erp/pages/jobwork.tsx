"use client";
import { useApi, inr2, qty } from "@/lib/erp/client";
import type { JobWorkChallan, Party } from "@/lib/erp/shared";
import { PageIntro, Empty, StatusBadge } from "../shared";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Info } from "lucide-react";

type JW = JobWorkChallan & { party?: Party };

export default function JobWorkPage() {
  // Job work uses the parties (job workers) + challans. For this prototype we
  // surface the demo job workers and the Sec.143 / ITC-04 rules.
  const { data: jobworkers } = useApi<Party[]>("/api/parties?role=JOBWORKER");

  return (
    <>
      <PageIntro>
        Job work — both directions. <strong>Outward</strong> (Sec. 143 challans: send material to job workers, track returns within 1 yr inputs / 3 yrs capital goods). <strong>Inward</strong> (receive customer material for processing, ITC-04 reporting).
      </PageIntro>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl border bg-card shadow-xs p-5">
          <h2 className="text-sm font-semibold mb-2">Outward job work (principal → job worker)</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Delivery challan <span className="font-mono">JWO/yy-yy/nnnn</span> (≤16 chars), printed in triplicate (Rule 45/55).</span></li>
            <li className="flex gap-2"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Stock moves RM → JW store (owned but excluded from available stock).</span></li>
            <li className="flex gap-2"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Return deadline: <strong>1 year</strong> (inputs) / <strong>3 years</strong> (capital goods). Moulds, dies, jigs, fixtures exempt.</span></li>
            <li className="flex gap-2"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>E-way bill compulsory for inter-state job work regardless of value.</span></li>
          </ul>
        </div>
        <div className="rounded-xl border bg-card shadow-xs p-5">
          <h2 className="text-sm font-semibold mb-2">Inward job work (Tau Power = job worker)</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Inward register <span className="font-mono">JIN/…</span>, return challan <span className="font-mono">JRT/…</span>, job-work tax invoice <span className="font-mono">JWI/…</span>.</span></li>
            <li className="flex gap-2"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Processing charges: <strong>SAC 998874</strong> (manufacturing services) @ 18% default — confirm with tax consultant.</span></li>
            <li className="flex gap-2"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span><strong>ITC-04</strong>: Table 4 (sent) + Table 5A (received back) CSV. Half-yearly (&gt; ₹5 Cr turnover) or annual.</span></li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-xs">
        <div className="px-5 pt-4 pb-2"><h2 className="text-sm font-semibold">Job workers (demo)</h2><p className="text-xs text-muted-foreground">GSTINs are placeholders — replace before go-live.</p></div>
        <div className="overflow-x-auto scroll-thin">
          {(jobworkers ?? []).length === 0 ? <Empty>No job workers registered</Empty> : (
            <table className="zebra w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b">{["Code", "Name", "GSTIN", "State", "City", "Distance"].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {(jobworkers ?? []).map((j) => (
                  <tr key={j.id} className="border-b last:border-0">
                    <td className="px-5 py-2 font-mono text-xs">{j.code}</td>
                    <td className="px-5">{j.name}</td>
                    <td className="px-5 font-mono text-xs">{j.gstin}</td>
                    <td className="px-5 text-xs">{j.stateCode}</td>
                    <td className="px-5 text-xs">{j.city}</td>
                    <td className="px-5 text-xs text-right tabular-nums">{j.distanceKm} km</td>
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
