import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, FilePlus2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useItems, useAction, lookup, qty, type Requirement } from "@/lib/erp";
import { PageIntro, Empty } from "@/components/layout";
import { NewOrderDialog } from "./production";

export default function PlanningPage() {
  const { data, isLoading } = useQuery<Requirement[]>({ queryKey: ["/api/mrp"] });
  const items = lookup(useItems().data);
  const [plan, setPlan] = useState<Requirement | null>(null);
  const indent = useAction("POST", "/api/indents", "Purchase indent raised — see Purchase › Indents");
  const short = (data ?? []).filter(r => r.shortage > 0).length;
  return (
    <>
      <PageIntro>Multi-level MRP across all planned orders, netted against free stock (QC quarantine excluded). Sub-assembly shortages can be planned as production orders; bought-out shortages raise purchase indents.</PageIntro>
      <div className="mb-3 text-sm" data-testid="text-mrp-summary">{isLoading ? "" : short ? <span><span className="font-semibold text-destructive">{short}</span> item{short > 1 ? "s" : ""} short for planned orders</span> : <span className="text-emerald-700 dark:text-emerald-400 font-medium">All planned orders are fully covered</span>}</div>
      <Card><CardContent className="p-0 overflow-x-auto">
        {isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !data?.length ? <Empty>No planned orders — plan one in Production</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40"><th className="text-left font-medium px-4 py-2">Item</th><th className="text-left font-medium px-3">Source</th><th className="text-right font-medium px-3">Required</th><th className="text-right font-medium px-3">Available</th><th className="text-right font-medium px-3">Shortage</th><th className="px-4" /></tr></thead>
            <tbody>{data.map(r => { const it = items.get(r.itemId); const make = it?.hasBom; return (
              <tr key={r.itemId} className="border-b last:border-0" data-testid={`row-mrp-${r.itemId}`}>
                <td className="px-4 py-2"><span className="font-mono text-xs">{r.code}</span><div className="text-xs text-muted-foreground">{r.name}</div></td>
                <td className="px-3 text-xs">{make ? "Make" : "Buy"}</td>
                <td className="px-3 text-right tabular-nums">{qty(r.required)} <span className="text-xs text-muted-foreground">{r.uom}</span></td>
                <td className="px-3 text-right tabular-nums">{qty(r.available)}</td>
                <td className={`px-3 text-right tabular-nums font-medium ${r.shortage ? "text-destructive" : "text-muted-foreground"}`}>{r.shortage ? qty(r.shortage) : "—"}</td>
                <td className="px-4 text-right">
                  {r.shortage > 0 && (make
                    ? <Button size="sm" variant="outline" onClick={() => setPlan(r)} data-testid={`button-plan-${r.itemId}`}><CalendarPlus className="h-3.5 w-3.5 mr-1" />Plan order</Button>
                    : <Button size="sm" variant="outline" disabled={indent.isPending} onClick={() => indent.mutate({ itemId: r.itemId, qty: r.shortage, requiredBy: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) })} data-testid={`button-indent-${r.itemId}`}><FilePlus2 className="h-3.5 w-3.5 mr-1" />Raise indent</Button>)}
                </td>
              </tr>); })}</tbody>
          </table>
        )}
      </CardContent></Card>
      <NewOrderDialog open={!!plan} onOpenChange={o => !o && setPlan(null)} presetItemId={plan?.itemId} presetQty={plan?.shortage} />
    </>
  );
}
