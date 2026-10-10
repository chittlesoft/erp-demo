"use client";
import { useState } from "react";
import { Plus, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApi, useAction, lookup, inr, qty } from "@/lib/erp/client";
import type { ItemRow, BomLine } from "@/lib/erp/shared";
import { PageIntro, Empty } from "../shared";

export default function BomPage() {
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const { data: bom, isLoading } = useApi<BomLine[]>("/api/bom");
  const itemMap = lookup(items);
  const [parent, setParent] = useState<string>("");
  const [expand, setExpand] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);

  const parents = (items ?? []).filter((i) => i.hasBom);
  const parentId = parent ? Number(parent) : (parents[0]?.id ?? 0);
  const lines = (bom ?? []).filter((b) => b.parentItemId === parentId);

  const del = useAction("DELETE", (id: number) => `/api/bom/${id}`, "Line deleted");

  return (
    <>
      <PageIntro actions={<Button onClick={() => setOpen(true)} disabled={!parentId}><Plus className="h-4 w-4 mr-1" />Add BOM line</Button>}>
        Multi-level bill of materials with scrap % and cost roll-up. Pick a parent to edit its components.
      </PageIntro>
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card shadow-xs p-3 lg:col-span-1 max-h-[70vh] overflow-y-auto scroll-thin">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 pb-2">Parent items</div>
          {parents.length === 0 ? <Empty>No parents</Empty> : parents.map((p) => {
            const childLines = (bom ?? []).filter((b) => b.parentItemId === p.id);
            const cost = childLines.reduce((s, l) => s + l.qty * (1 + l.scrapPct / 100) * (itemMap.get(l.componentItemId)?.hasBom ? itemMap.get(l.componentItemId)!.rolledCost : itemMap.get(l.componentItemId)?.stdCost ?? 0), 0);
            return (
              <button key={p.id} onClick={() => setParent(String(p.id))} className={`w-full text-left rounded-md px-2.5 py-2 mb-0.5 text-sm transition-colors ${parentId === p.id ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"}`}>
                <div className="font-mono text-xs">{p.code}</div>
                <div className="text-xs text-muted-foreground truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{childLines.length} lines · roll-up {inr(cost)}</div>
              </button>
            );
          })}
        </div>
        <div className="lg:col-span-3 rounded-xl border bg-card shadow-xs">
          <div className="px-5 pt-4 pb-2 border-b">
            <h2 className="text-sm font-semibold font-mono">{itemMap.get(parentId)?.code ?? "—"}</h2>
            <p className="text-xs text-muted-foreground">{itemMap.get(parentId)?.name}</p>
          </div>
          <div className="overflow-x-auto scroll-thin">
            {isLoading ? <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div> : lines.length === 0 ? <Empty>No components — add a line</Empty> : (
              <table className="zebra w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground border-b">
                  {["Component", "Qty", "Scrap %", "Unit cost", "Line cost", ""].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i >= 1 && i <= 4 ? "text-right" : "text-left"}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {lines.map((l) => {
                    const c = itemMap.get(l.componentItemId);
                    const lineCost = l.qty * (1 + l.scrapPct / 100) * (c?.hasBom ? c.rolledCost : c?.stdCost ?? 0);
                    return (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="px-5 py-2">
                          <span className="font-mono text-xs">{c?.code}</span>
                          <span className="text-xs text-muted-foreground block">{c?.name}</span>
                        </td>
                        <td className="px-5 text-right tabular-nums">{qty(l.qty)} {c?.uom}</td>
                        <td className="px-5 text-right tabular-nums">{l.scrapPct}%</td>
                        <td className="px-5 text-right tabular-nums">{inr(c?.hasBom ? c.rolledCost : c?.stdCost ?? 0)}{c?.hasBom && <span className="text-[10px] text-muted-foreground block">BOM</span>}</td>
                        <td className="px-5 text-right tabular-nums font-medium">{inr(lineCost)}</td>
                        <td className="px-2"><Button variant="ghost" size="icon" onClick={() => del.mutate(l.id)} aria-label="Delete line"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <AddBomLineDialog open={open} onOpenChange={setOpen} parentId={parentId} items={items ?? []} />
    </>
  );
}

function AddBomLineDialog({ open, onOpenChange, parentId, items }: { open: boolean; onOpenChange: (o: boolean) => void; parentId: number; items: ItemRow[] }) {
  const [comp, setComp] = useState("");
  const [qtyVal, setQty] = useState("1");
  const [scrap, setScrap] = useState("0");
  const add = useAction("POST", "/api/bom", "Line added");
  const submit = () => {
    add.mutate({ parentItemId: parentId, componentItemId: Number(comp), qty: Number(qtyVal), scrapPct: Number(scrap), version: "A" } as never, { onSuccess: () => { onOpenChange(false); setComp(""); setQty("1"); setScrap("0"); } });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add component to {items.find((i) => i.id === parentId)?.code}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs font-medium">Component</label>
            <Select value={comp} onValueChange={setComp}><SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent className="max-h-72">{items.filter((i) => i.id !== parentId).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Quantity</label><Input type="number" step="0.001" className="mt-1" value={qtyVal} onChange={(e) => setQty(e.target.value)} /></div>
            <div><label className="text-xs font-medium">Scrap %</label><Input type="number" step="0.1" className="mt-1" value={scrap} onChange={(e) => setScrap(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={!comp || add.isPending}>Add line</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
