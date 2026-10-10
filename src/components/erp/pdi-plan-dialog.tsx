"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi, useAction } from "@/lib/erp/client";
import type { PdiChar, PdiPlan, PlanRow } from "@/lib/erp/pdi-shared";

/** Dialog editor for a single finished-good item's PDI plan. Mirrors the
 * characteristics grid from the original `PlanEditor`. */
export function PdiPlanDialog({
  item,
  onClose,
}: {
  item: { id: number; code: string; name: string } | null;
  onClose: () => void;
}) {
  const { data: plans } = useApi<PlanRow[]>("/api/phase3/pdi/plans");
  const existing = item ? plans?.find((p) => p.itemId === item.id)?.plan ?? null : null;
  const [d, setD] = useState<PdiPlan | null>(null);

  // (Re)initialise the form whenever the target item (or its plan) changes.
  useEffect(() => {
    if (!item) {
      setD(null);
      return;
    }
    if (existing) {
      setD(JSON.parse(JSON.stringify(existing)) as PdiPlan);
    } else {
      setD({ itemId: item.id, drgRev: "00", drgDate: null, refStandard: "-", chars: [] });
    }
  }, [item?.id, existing]);

  const save = useAction<PdiPlan>("POST", "/api/phase3/pdi/plans", "PDI plan saved");

  if (!item) return null;
  if (!d) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Loading…</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const upd = (i: number, patch: Partial<PdiChar>) =>
    setD({ ...d, chars: d.chars.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const addChar = () =>
    setD({
      ...d,
      chars: [
        ...d.chars,
        {
          sr: d.chars.length + 1,
          description: "",
          kind: "num",
          nominal: null,
          tolMinus: null,
          tolPlus: null,
          spec: "",
          method: "",
          unit: "mm",
        },
      ],
    });
  const removeChar = (i: number) =>
    setD({ ...d, chars: d.chars.filter((_, j) => j !== i) });

  const submit = () =>
    save.mutate(d, { onSuccess: () => onClose() });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            PDI plan — <span className="font-mono">{item.code}</span>
          </DialogTitle>
          <DialogDescription>
            {item.name}
            {existing ? " · editing existing plan" : " · no plan yet"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Characteristics checked before dispatch, per part. Parts with a plan cannot be invoiced until an accepted PDI covers the dispatch quantity.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Drg. rev</Label>
              <Input
                value={d.drgRev}
                onChange={(e) => setD({ ...d, drgRev: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Drg. date</Label>
              <Input
                type="date"
                value={d.drgDate ?? ""}
                onChange={(e) => setD({ ...d, drgDate: e.target.value || null })}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Reference standard</Label>
              <Input
                value={d.refStandard}
                onChange={(e) => setD({ ...d, refStandard: e.target.value })}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-left font-medium py-2 px-2 w-8">Sr.</th>
                  <th className="text-left font-medium px-1">Description</th>
                  <th className="text-left font-medium px-1 w-28">Type</th>
                  <th className="text-left font-medium px-1">Specification</th>
                  <th className="text-left font-medium px-1">Inspection method</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {d.chars.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5 px-2 tabular-nums">{i + 1}</td>
                    <td className="px-1">
                      <Input
                        className="h-8"
                        value={c.description}
                        onChange={(e) => upd(i, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-1">
                      <Select
                        value={c.kind}
                        onValueChange={(v) => upd(i, { kind: v as "num" | "attr" })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="num">Measured</SelectItem>
                          <SelectItem value="attr">OK / NG</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-1">
                      {c.kind === "num" ? (
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 w-20 text-right tabular-nums"
                            placeholder="nominal"
                            value={c.nominal ?? ""}
                            onChange={(e) => upd(i, { nominal: numOrNull(e.target.value) })}
                          />
                          <span className="text-xs text-muted-foreground">−</span>
                          <Input
                            className="h-8 w-16 text-right tabular-nums"
                            placeholder="tol"
                            value={c.tolMinus ?? ""}
                            onChange={(e) => upd(i, { tolMinus: numOrNull(e.target.value) })}
                          />
                          <span className="text-xs text-muted-foreground">+</span>
                          <Input
                            className="h-8 w-16 text-right tabular-nums"
                            placeholder="tol"
                            value={c.tolPlus ?? ""}
                            onChange={(e) => upd(i, { tolPlus: numOrNull(e.target.value) })}
                          />
                          <Input
                            className="h-8 w-14"
                            placeholder="unit"
                            value={c.unit}
                            onChange={(e) => upd(i, { unit: e.target.value })}
                          />
                        </div>
                      ) : (
                        <Input
                          className="h-8 font-mono"
                          value={c.spec}
                          onChange={(e) => upd(i, { spec: e.target.value })}
                          placeholder="e.g. M14x1.5-6g"
                        />
                      )}
                    </td>
                    <td className="px-1">
                      <Input
                        className="h-8"
                        value={c.method}
                        onChange={(e) => upd(i, { method: e.target.value })}
                      />
                    </td>
                    <td className="px-1 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Remove characteristic"
                        onClick={() => removeChar(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {d.chars.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                      No characteristics yet — click “Add characteristic”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addChar}>
              <Plus className="h-4 w-4 mr-1" /> Add characteristic
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={submit}
          >
            <Save className="h-4 w-4 mr-1" /> Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
