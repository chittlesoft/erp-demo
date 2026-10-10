import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useItems, useAction, lookup, inr, qty, LINE_LABEL, type BomLine, type ItemRow } from "@/lib/erp";
import { PageIntro, Empty } from "@/components/layout";

function BomTree({ parentId, multiplier, depth, items, editable }: { parentId: number; multiplier: number; depth: number; items: Map<number, ItemRow>; editable: boolean }) {
  const { data } = useQuery<BomLine[]>({ queryKey: ["/api/bom", parentId] });
  const del = useAction<number>("DELETE", id => `/api/bom/${id}`, "Component removed");
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  if (!data) return null;
  if (!data.length && depth === 0) return <Empty>No components yet — add the first one below.</Empty>;
  return (
    <>
      {data.map(l => {
        const c = items.get(l.componentItemId);
        const q = l.qty * multiplier;
        const ext = q * (1 + l.scrapPct / 100) * (c ? (c.hasBom ? c.rolledCost : c.stdCost) : 0);
        return (
          <div key={l.id}>
            <div className="grid grid-cols-[1fr_80px_70px_100px_36px] items-center gap-2 px-4 py-2 border-b text-sm hover:bg-muted/30" data-testid={`row-bom-${l.id}`}>
              <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: depth * 20 }}>
                {c?.hasBom ? (
                  <button onClick={() => setOpenRows(s => ({ ...s, [l.id]: !s[l.id] }))} aria-label="Expand" data-testid={`button-expand-${l.id}`}>
                    <ChevronRight className={`h-4 w-4 transition-transform ${openRows[l.id] ? "rotate-90" : ""}`} />
                  </button>
                ) : <span className="w-4" />}
                <span className="font-mono text-xs">{c?.code}</span>
                <span className="truncate text-muted-foreground">{c?.name}</span>
              </div>
              <div className="text-right tabular-nums">{qty(q)} <span className="text-xs text-muted-foreground">{c?.uom}</span></div>
              <div className="text-right tabular-nums text-xs text-muted-foreground">{l.scrapPct ? `${l.scrapPct}%` : "—"}</div>
              <div className="text-right tabular-nums">{inr(ext)}</div>
              <div>{editable && depth === 0 && <Button size="icon" variant="ghost" onClick={() => del.mutate(l.id)} aria-label="Remove" data-testid={`button-delete-bom-${l.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
            </div>
            {openRows[l.id] && <BomTree parentId={l.componentItemId} multiplier={q} depth={depth + 1} items={items} editable={false} />}
          </div>
        );
      })}
    </>
  );
}

export default function BomPage() {
  const { data } = useItems();
  const items = lookup(data);
  const parents = (data ?? []).filter(i => i.type === "FG" || i.type === "SFG");
  const [sel, setSel] = useState<number | null>(null);
  const current = sel ?? parents[0]?.id ?? null;
  const parent = current ? items.get(current) : undefined;
  const [comp, setComp] = useState<string>("");
  const [q, setQ] = useState("1");
  const [scrap, setScrap] = useState("0");
  const add = useAction("POST", "/api/bom", "Component added");
  return (
    <>
      <PageIntro>Multi-level product structures. Sub-assemblies (e.g. NOx probe) expand inline; costs roll up automatically including scrap allowance.</PageIntro>
      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <Card className="h-fit">
          <CardContent className="p-1.5">
            {parents.map(p => (
              <button key={p.id} onClick={() => setSel(p.id)} data-testid={`button-bom-parent-${p.id}`}
                className={`w-full text-left rounded px-3 py-2 text-sm ${current === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <div className="font-mono text-xs">{p.code}</div>
                <div className={`text-xs truncate ${current === p.id ? "opacity-80" : "text-muted-foreground"}`}>{p.productLine ? LINE_LABEL[p.productLine] + " · " : ""}{p.name}</div>
              </button>
            ))}
          </CardContent>
        </Card>
        {parent && (
          <Card>
            <CardHeader className="pb-3 flex-row items-start gap-4 space-y-0">
              <div><CardTitle className="text-sm font-semibold">{parent.name}</CardTitle><div className="text-xs text-muted-foreground font-mono mt-1">{parent.code} · BOM version A</div></div>
              <div className="ml-auto text-right"><div className="text-xs text-muted-foreground">Rolled-up material cost</div><div className="text-lg font-semibold tabular-nums" data-testid="text-rolled-cost">{inr(parent.rolledCost)}</div></div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[1fr_80px_70px_100px_36px] gap-2 px-4 py-2 border-y bg-muted/40 text-xs text-muted-foreground font-medium">
                <div>Component</div><div className="text-right">Qty / unit</div><div className="text-right">Scrap</div><div className="text-right">Cost</div><div />
              </div>
              <BomTree parentId={parent.id} multiplier={1} depth={0} items={items} editable />
              <form className="flex flex-wrap items-end gap-2 p-4" onSubmit={e => { e.preventDefault(); if (comp) add.mutate({ parentItemId: parent.id, componentItemId: +comp, qty: +q, scrapPct: +scrap, version: "A" }, { onSuccess: () => setComp("") }); }}>
                <div className="flex-1 min-w-[220px] space-y-1"><Label className="text-xs">Add component</Label>
                  <Select value={comp} onValueChange={setComp}><SelectTrigger data-testid="select-bom-component"><SelectValue placeholder="Choose item" /></SelectTrigger>
                    <SelectContent>{(data ?? []).filter(i => i.id !== parent.id && i.type !== "FG").map(i => <SelectItem key={i.id} value={String(i.id)}>{i.code} — {i.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="w-24 space-y-1"><Label className="text-xs">Qty</Label><Input type="number" step="any" min="0" value={q} onChange={e => setQ(e.target.value)} data-testid="input-bom-qty" /></div>
                <div className="w-24 space-y-1"><Label className="text-xs">Scrap %</Label><Input type="number" step="any" min="0" value={scrap} onChange={e => setScrap(e.target.value)} data-testid="input-bom-scrap" /></div>
                <Button type="submit" disabled={!comp || add.isPending} data-testid="button-add-bom"><Plus className="h-4 w-4 mr-1" />Add</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
