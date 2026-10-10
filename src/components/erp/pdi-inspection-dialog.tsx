"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi, useAction, qty } from "@/lib/erp/client";
import { StatusBadge } from "./shared";
import {
  charOk,
  specText,
  dmy,
  type CreateReportInput,
  type PendingRow,
  type PlanRow,
  type PdiChar,
} from "@/lib/erp/pdi-shared";

/** Dialog to perform a PDI inspection for a pending SO line. Renders the
 * characteristics grid from the item's PDI plan with N reading columns
 * (N = sample no.) and per-cell live ok/not-ok validation. */
export function PdiInspectionDialog({
  row,
  onClose,
}: {
  row: PendingRow | null;
  onClose: () => void;
}) {
  const { data: plans } = useApi<PlanRow[]>("/api/phase3/pdi/plans");
  const plan = row ? plans?.find((p) => p.itemId === row.itemId)?.plan ?? null : null;

  const [q, setQ] = useState("");
  const [n, setN] = useState("5");
  const [mtr, setMtr] = useState(false);
  const [insp, setInsp] = useState("PDI Inspector");
  const [note, setNote] = useState("");
  const [vals, setVals] = useState<Record<number, string[]>>({});

  useEffect(() => {
    if (!row) return;
    const qq = Math.min(row.toInspect, row.fgStock || row.toInspect);
    setQ(String(qq));
    setN(String(Math.min(qq || 5, 5)));
    setMtr(false);
    setNote("");
    setVals({});
  }, [row?.soLineId, row?.toInspect, row?.fgStock]);

  const save = useAction<CreateReportInput>(
    "POST",
    "/api/phase3/pdi/reports",
    "PDI report saved",
  );

  if (!row) return null;

  const S = Math.max(1, Math.min(10, Math.floor(+n || 1)));
  const get = (sr: number, i: number) => vals[sr]?.[i] ?? "";
  const set = (sr: number, i: number, v: string) =>
    setVals((p) => {
      const a = [...(p[sr] ?? [])];
      a[i] = v;
      return { ...p, [sr]: a };
    });

  const rowOk = (c: PdiChar) => {
    const r = Array.from({ length: S }, (_, i) => charOk(c, get(c.sr, i)));
    return r.some((x) => x === null) ? null : r.every(Boolean);
  };
  const results = plan?.chars.map(rowOk) ?? [];
  const complete = results.length > 0 && results.every((r) => r !== null);
  const overall = complete ? (results.every(Boolean) ? "ACCEPT" : "REJECT") : null;

  const fillOk = () =>
    setVals((p) => {
      const o = { ...p };
      plan?.chars
        .filter((c) => c.kind === "attr")
        .forEach((c) => {
          o[c.sr] = Array.from({ length: S }, () => "OK");
        });
      return o;
    });

  const submit = () =>
    save.mutate(
      {
        soLineId: row.soLineId,
        qty: +q,
        sample: S,
        mtr,
        inspector: insp,
        note,
        readings: plan!.chars.map((c) => ({
          sr: c.sr,
          values: Array.from({ length: S }, (_, i) => get(c.sr, i)),
        })),
      },
      { onSuccess: () => onClose() },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Pre-dispatch inspection — <span className="font-mono">{row.itemCode}</span>
          </DialogTitle>
          <DialogDescription>
            {row.itemName}
            {row.customerPartNo && (
              <>
                {" "}· customer part no.{" "}
                <span className="font-mono">{row.customerPartNo}</span>
              </>
            )}{" "}· {row.customer} · {row.soNo}
          </DialogDescription>
        </DialogHeader>

        {!plan ? (
          <p className="text-sm text-destructive">No PDI plan for this part.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Invoice qty</Label>
                <Input
                  type="number"
                  min={1}
                  max={row.toInspect}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sampling no.</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={n}
                  onChange={(e) => setN(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Inspector</Label>
                <Input value={insp} onChange={(e) => setInsp(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Material test report</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={mtr} onCheckedChange={setMtr} />
                  <span className="text-sm">{mtr ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Drg. rev {plan.drgRev} · {dmy(plan.drgDate)} · reference standard{" "}
              {plan.refStandard || "-"}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-xs text-muted-foreground">
                    <th className="text-left font-medium p-2">Sr.</th>
                    <th className="text-left font-medium p-2">Description</th>
                    <th className="text-left font-medium p-2">Specification</th>
                    <th className="text-left font-medium p-2">Method</th>
                    {Array.from({ length: S }, (_, i) => (
                      <th key={i} className="font-medium p-2 text-center w-20">
                        {i + 1}
                      </th>
                    ))}
                    <th className="font-medium p-2">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.chars.map((c, ci) => (
                    <tr key={c.sr} className="border-t">
                      <td className="p-2 tabular-nums">{c.sr}</td>
                      <td className="p-2 whitespace-nowrap">{c.description}</td>
                      <td className="p-2 font-mono text-xs whitespace-nowrap">{specText(c)}</td>
                      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{c.method}</td>
                      {Array.from({ length: S }, (_, i) => {
                        const v = get(c.sr, i);
                        const ok = charOk(c, v);
                        return (
                          <td key={i} className="p-1">
                            {c.kind === "attr" ? (
                              <Select value={v} onValueChange={(x) => set(c.sr, i, x)}>
                                <SelectTrigger
                                  className={`h-8 px-2 ${ok === false ? "border-destructive text-destructive" : ""}`}
                                >
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="OK">OK</SelectItem>
                                  <SelectItem value="NG">NG</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                inputMode="decimal"
                                className={`h-8 px-2 text-right tabular-nums ${ok === false ? "border-destructive text-destructive" : ok === true ? "border-emerald-500 text-emerald-700 dark:text-emerald-400" : ""}`}
                                value={v}
                                onChange={(e) => set(c.sr, i, e.target.value)}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2">
                        {results[ci] == null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <StatusBadge status={results[ci] ? "ACCEPT" : "REJECT"} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Button variant="outline" size="sm" onClick={fillOk}>
                Mark all attribute checks OK
              </Button>
              <div className="flex-1 min-w-[220px] space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Pending {qty(row.pending)} · FG stock {qty(row.fgStock)} · already covered by accepted
              PDI {qty(row.covered)} · to inspect {qty(row.toInspect)}
            </div>

            {overall === "REJECT" && (
              <p className="text-sm text-destructive">
                One or more characteristics are out of specification. Saving will record a rejected
                PDI and raise an NCR; the lot cannot be dispatched.
              </p>
            )}
          </>
        )}

        <DialogFooter className="items-center gap-3">
          {overall && (
            <span className="text-sm">
              Result <StatusBadge status={overall} />
            </span>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!plan || !complete || save.isPending || !(+q > 0)}
            onClick={submit}
          >
            <ClipboardCheck className="h-4 w-4 mr-1" /> Save PDI report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
