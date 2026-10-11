"use client";
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TYPE_LABEL, LINE_LABEL, type ItemRow } from "@/lib/erp/shared";
import { inr, qty } from "@/lib/erp/client";

/** Read-only "quick view" of an item — opened from the Eye icon in the items
 * table. All fields render in a label : value grid; the dialog title is the
 * item code. The Edit button just closes the dialog (the parent can re-open
 * the editor via the pencil in the row if desired). */
function Field({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === false ||
    (typeof value === "string" && value.trim() === "");
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40 last:border-0">
      <dt className="text-xs text-muted-foreground font-medium leading-relaxed">
        {label}
      </dt>
      <dd className="col-span-2 text-sm tabular-nums break-words">
        {isEmpty ? <span className="text-muted-foreground">—</span> : value}
      </dd>
    </div>
  );
}

export function ItemDetail({
  item,
  onClose,
}: {
  item: ItemRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{item?.code ?? ""}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="max-h-[70vh] overflow-y-auto scroll-thin pr-1">
            <dl>
              <Field
                label="Code"
                value={<span className="font-mono text-xs">{item.code}</span>}
              />
              <Field label="Description" value={item.name} />
              <Field
                label="Type"
                value={TYPE_LABEL[item.type] ?? item.type}
              />
              <Field
                label="Product line"
                value={
                  item.productLine
                    ? LINE_LABEL[item.productLine] ?? item.productLine
                    : null
                }
              />
              <Field
                label="HSN code"
                value={<span className="font-mono text-xs">{item.hsn}</span>}
              />
              <Field label="GST rate" value={`${item.gstRate}%`} />
              <Field label="Unit of measure" value={item.uom} />
              <Field
                label="Traceability"
                value={<span className="capitalize">{item.tracking}</span>}
              />
              <Field
                label="Reorder level"
                value={`${qty(item.reorderLevel)} ${item.uom}`}
              />
              <Field label="Standard cost" value={inr(item.stdCost)} />
              <Field
                label="Rolled cost (BOM)"
                value={item.hasBom ? inr(item.rolledCost) : null}
              />
              <Field
                label="On hand"
                value={`${qty(item.onHand)} ${item.uom}`}
              />
              <Field
                label="OEM customer part no"
                value={item.customerPartNo}
              />
              <Field label="Key specifications" value={item.specs} />
              <Field label="Has BOM" value={item.hasBom ? "Yes" : "No"} />
            </dl>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
