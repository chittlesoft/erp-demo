import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertItemSchema, ITEM_TYPES, PRODUCT_LINES, TRACKING } from "@shared/schema";
import { useItems, useAction, inr, qty, LINE_LABEL, type ItemRow } from "@/lib/erp";
import { PageIntro, Empty } from "@/components/layout";

const formSchema = insertItemSchema.extend({
  code: z.string().min(2, "Required").transform(s => s.toUpperCase()),
  name: z.string().min(2, "Required"),
  hsn: z.string().regex(/^\d{4,8}$/, "HSN must be 4–8 digits"),
  gstRate: z.coerce.number().min(0).max(28),
  reorderLevel: z.coerce.number().min(0),
  stdCost: z.coerce.number().min(0),
});
type FormValues = z.input<typeof formSchema>;
const blank: FormValues = { code: "", name: "", type: "RM", productLine: null, hsn: "", gstRate: 18, uom: "NOS", tracking: "batch", reorderLevel: 0, stdCost: 0, customerPartNo: null, specs: null };
const TYPE_LABEL: Record<string, string> = { RM: "Raw material", SFG: "Sub-assembly", FG: "Finished good", CONSUMABLE: "Consumable" };

function ItemDialog({ item, open, onOpenChange }: { item: ItemRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), values: item ? { ...blank, ...item } : blank });
  const create = useAction("POST", "/api/items", "Item created");
  const update = useAction("PATCH", `/api/items/${item?.id}`, "Item updated");
  const submit = form.handleSubmit(v => (item ? update : create).mutate(v as any, { onSuccess: () => onOpenChange(false) }));
  const sel = (name: keyof FormValues, label: string, opts: readonly string[], labels?: Record<string, string>, allowNone = false) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem><FormLabel>{label}</FormLabel>
        <Select value={(field.value as string) ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
          <FormControl><SelectTrigger data-testid={`select-${name}`}><SelectValue /></SelectTrigger></FormControl>
          <SelectContent>{allowNone && <SelectItem value="none">—</SelectItem>}{opts.map(o => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>)} />
  );
  const txt = (name: keyof FormValues, label: string, type = "text") => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem><FormLabel>{label}</FormLabel><FormControl><Input type={type} {...field} value={(field.value as any) ?? ""} onChange={e => field.onChange((name === "customerPartNo" || name === "specs") && !e.target.value ? null : e.target.value)} data-testid={`input-${name}`} /></FormControl><FormMessage /></FormItem>)} />
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{item ? `Edit ${item.code}` : "New item"}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="grid grid-cols-2 gap-3">
            {txt("code", "Item code")}{txt("name", "Description")}
            {sel("type", "Type", ITEM_TYPES, TYPE_LABEL)}{sel("productLine", "Product line", PRODUCT_LINES, LINE_LABEL, true)}
            {txt("hsn", "HSN code")}{txt("gstRate", "GST rate %", "number")}
            {sel("uom", "Unit", ["NOS", "MTR", "KG", "LTR", "SET"])}{sel("tracking", "Traceability", TRACKING, { none: "None", batch: "Batch / lot", serial: "Serial number" })}
            {txt("reorderLevel", "Reorder level", "number")}{txt("stdCost", "Standard cost (₹)", "number")}
            <div className="col-span-2">{txt("customerPartNo", "OEM customer part no. (optional)")}</div>
            <div className="col-span-2">{txt("specs", "Key specifications (optional)")}</div>
            <DialogFooter className="col-span-2 mt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || update.isPending} data-testid="button-save-item">{item ? "Save changes" : "Create item"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ItemsPage() {
  const { data, isLoading } = useItems();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [edit, setEdit] = useState<ItemRow | null>(null);
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => (data ?? []).filter(i => (type === "all" || i.type === type) && (i.code + i.name + (i.customerPartNo ?? "")).toLowerCase().includes(q.toLowerCase())), [data, q, type]);
  return (
    <>
      <PageIntro actions={<Button onClick={() => { setEdit(null); setOpen(true); }} data-testid="button-new-item"><Plus className="h-4 w-4 mr-1" />New item</Button>}>
        Raw materials, sub-assemblies and finished sensors, with HSN/GST, traceability level and OEM part numbers.
      </PageIntro>
      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search code, name or OEM part no." className="pl-8" value={q} onChange={e => setQ(e.target.value)} data-testid="input-search-items" /></div>
          <Select value={type} onValueChange={setType}><SelectTrigger className="w-44" data-testid="select-filter-type"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent></Select>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div> : rows.length === 0 ? <Empty>No items match</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40">
                {["Code", "Description", "Type", "Line", "HSN", "GST", "Tracking", "On hand", "Reorder", "Cost", ""].map((h, i) => <th key={i} className={`font-medium px-3 py-2 ${i >= 7 && i <= 9 ? "text-right" : "text-left"}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(i => {
                  const low = i.reorderLevel > 0 && i.onHand < i.reorderLevel;
                  return (
                    <tr key={i.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-item-${i.id}`}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{i.code}</td>
                      <td className="px-3">{i.name}{i.customerPartNo && <div className="text-[11px] text-muted-foreground">OEM: {i.customerPartNo}</div>}{i.specs && <div className="text-[11px] text-muted-foreground max-w-md">{i.specs}</div>}</td>
                      <td className="px-3 text-xs">{TYPE_LABEL[i.type]}</td>
                      <td className="px-3 text-xs">{i.productLine ? LINE_LABEL[i.productLine] : "—"}</td>
                      <td className="px-3 font-mono text-xs">{i.hsn}</td>
                      <td className="px-3 text-xs">{i.gstRate}%</td>
                      <td className="px-3 text-xs capitalize">{i.tracking}</td>
                      <td className={`px-3 text-right tabular-nums ${low ? "text-destructive font-semibold" : ""}`}>{qty(i.onHand)} <span className="text-muted-foreground text-xs font-normal">{i.uom}</span></td>
                      <td className="px-3 text-right tabular-nums text-muted-foreground">{qty(i.reorderLevel)}</td>
                      <td className="px-3 text-right tabular-nums">{inr(i.hasBom ? i.rolledCost : i.stdCost)}{i.hasBom && <div className="text-[10px] text-muted-foreground">BOM roll-up</div>}</td>
                      <td className="px-2"><Button variant="ghost" size="icon" onClick={() => { setEdit(i); setOpen(true); }} aria-label="Edit" data-testid={`button-edit-item-${i.id}`}><Pencil className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <ItemDialog item={edit} open={open} onOpenChange={setOpen} />
    </>
  );
}
