"use client";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Pencil,
  Search,
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ITEM_TYPES, PRODUCT_LINES, TRACKING, UOMS, TYPE_LABEL, LINE_LABEL, type ItemRow } from "@/lib/erp/shared";
import { useApi, useAction, inr, qty } from "@/lib/erp/client";
import { PageIntro, Empty } from "../shared";
import { ExportButton } from "../export-button";
import { ItemDetail } from "../item-detail";

const ITEM_CSV_COLUMNS = [
  { key: "code", header: "Code" },
  { key: "name", header: "Description" },
  { key: "type", header: "Type" },
  { key: "productLine", header: "Product line" },
  { key: "hsn", header: "HSN" },
  { key: "gstRate", header: "GST %" },
  { key: "uom", header: "UOM" },
  { key: "tracking", header: "Tracking" },
  { key: "onHand", header: "On hand" },
  { key: "reorderLevel", header: "Reorder level" },
  { key: "stdCost", header: "Std cost" },
  { key: "rolledCost", header: "Rolled cost" },
  { key: "customerPartNo", header: "OEM part no" },
  { key: "specs", header: "Specs" },
] as const;

const formSchema = z.object({
  code: z.string().min(2, "Required").transform((s) => s.toUpperCase()),
  name: z.string().min(2, "Required"),
  type: z.enum(ITEM_TYPES),
  productLine: z.string().nullable(),
  hsn: z.string().regex(/^\d{4,8}$/, "HSN must be 4–8 digits"),
  gstRate: z.coerce.number().min(0).max(28),
  uom: z.enum(UOMS),
  tracking: z.enum(TRACKING),
  reorderLevel: z.coerce.number().min(0),
  stdCost: z.coerce.number().min(0),
  customerPartNo: z.string().nullable(),
  specs: z.string().nullable(),
});
type FormValues = z.input<typeof formSchema>;
const blank: FormValues = { code: "", name: "", type: "RM", productLine: null, hsn: "", gstRate: 18, uom: "NOS", tracking: "batch", reorderLevel: 0, stdCost: 0, customerPartNo: null, specs: null };

function ItemDialog({ item, open, onOpenChange }: { item: ItemRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), values: item ? { ...blank, ...item, productLine: item.productLine as never, customerPartNo: item.customerPartNo as never, specs: item.specs as never } : blank });
  const create = useAction("POST", "/api/items", "Item created");
  const update = useAction("PATCH", `/api/items/${item?.id}`, "Item updated");
  const submit = form.handleSubmit((v) => (item ? update : create).mutate(v as never, { onSuccess: () => onOpenChange(false) }));
  const sel = (name: keyof FormValues, label: string, opts: readonly string[], labels?: Record<string, string>, allowNone = false) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem><FormLabel>{label}</FormLabel>
        <Select value={(field.value as string) ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
          <SelectContent>{allowNone && <SelectItem value="none">—</SelectItem>}{opts.map((o) => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>)} />
  );
  const txt = (name: keyof FormValues, label: string, type = "text") => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem><FormLabel>{label}</FormLabel><FormControl><Input type={type} {...field} value={(field.value as never) ?? ""} onChange={(e) => field.onChange((name === "customerPartNo" || name === "specs") && !e.target.value ? null : e.target.value)} /></FormControl><FormMessage /></FormItem>)} />
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
            {sel("uom", "Unit", UOMS)}{sel("tracking", "Traceability", TRACKING, { none: "None", batch: "Batch / lot", serial: "Serial number" })}
            {txt("reorderLevel", "Reorder level", "number")}{txt("stdCost", "Standard cost (₹)", "number")}
            <div className="col-span-2">{txt("customerPartNo", "OEM customer part no. (optional)")}</div>
            <div className="col-span-2">{txt("specs", "Key specifications (optional)")}</div>
            <DialogFooter className="col-span-2 mt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>{item ? "Save changes" : "Create item"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Sorting ----------
type SortKey = "code" | "name" | "type" | "onHand" | "stdCost";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ChevronUp : ChevronDown;
  const isRight = align === "right";
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`inline-flex items-center gap-1 ${isRight ? "justify-end" : ""} hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
      aria-label={`Sort by ${label} ${active ? sortDir : "none"}`}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3" aria-hidden />
    </button>
  );
}

export default function ItemsPage() {
  const { data, isLoading } = useApi<ItemRow[]>("/api/items");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [productLine, setProductLine] = useState("all");
  const [tracking, setTracking] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [edit, setEdit] = useState<ItemRow | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ItemRow | null>(null);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (data ?? []).filter((i) => {
      if (type !== "all" && i.type !== type) return false;
      if (productLine !== "all" && i.productLine !== productLine) return false;
      if (tracking !== "all" && i.tracking !== tracking) return false;
      if (ql && !((i.code + " " + i.name + " " + (i.customerPartNo ?? "")).toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [data, q, type, productLine, tracking]);

  const rows = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  return (
    <>
      <PageIntro actions={
        <div className="flex items-center gap-2">
          <ExportButton filename="tau-items" rows={rows as unknown as Record<string, unknown>[]} columns={[...ITEM_CSV_COLUMNS]} />
          <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New item</Button>
        </div>
      }>
        Raw materials, sub-assemblies and finished sensors, with HSN/GST, traceability level and OEM part numbers.
      </PageIntro>
      <div className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap gap-2 p-3 border-b">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search code, name or OEM part no." className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={type} onValueChange={setType}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent></Select>
          <Select value={productLine} onValueChange={setProductLine}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All lines</SelectItem>{PRODUCT_LINES.map((p) => <SelectItem key={p} value={p}>{LINE_LABEL[p]}</SelectItem>)}</SelectContent></Select>
          <Select value={tracking} onValueChange={setTracking}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All tracking</SelectItem>{TRACKING.map((t) => <SelectItem key={t} value={t}><span className="capitalize">{t}</span></SelectItem>)}</SelectContent></Select>
        </div>
        <div className="overflow-x-auto scroll-thin">
          {isLoading ? <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div> : rows.length === 0 ? <Empty>No items match</Empty> : (
            <table className="w-full text-sm zebra table-compact">
              <thead>
                <tr className="text-xs text-muted-foreground border-b bg-muted/40">
                  <th className="font-medium px-3 py-2 text-left">
                    <SortHeader label="Code" k="code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="font-medium px-3 py-2 text-left">
                    <SortHeader label="Description" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="font-medium px-3 py-2 text-left">
                    <SortHeader label="Type" k="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="font-medium px-3 py-2 text-left">Line</th>
                  <th className="font-medium px-3 py-2 text-left">HSN</th>
                  <th className="font-medium px-3 py-2 text-left">GST</th>
                  <th className="font-medium px-3 py-2 text-left">Tracking</th>
                  <th className="font-medium px-3 py-2 text-right">
                    <SortHeader label="On hand" k="onHand" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  </th>
                  <th className="font-medium px-3 py-2 text-right">Reorder</th>
                  <th className="font-medium px-3 py-2 text-right">
                    <SortHeader label="Cost" k="stdCost" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  </th>
                  <th className="font-medium px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const low = i.reorderLevel > 0 && i.onHand < i.reorderLevel;
                  return (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{i.code}</td>
                      <td className="px-3 py-2">{i.name}{i.customerPartNo && <div className="text-[11px] text-muted-foreground">OEM: {i.customerPartNo}</div>}{i.specs && <div className="text-[11px] text-muted-foreground max-w-md">{i.specs}</div>}</td>
                      <td className="px-3 py-2 text-xs">{TYPE_LABEL[i.type]}</td>
                      <td className="px-3 py-2 text-xs">{i.productLine ? LINE_LABEL[i.productLine] : "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{i.hsn}</td>
                      <td className="px-3 py-2 text-xs">{i.gstRate}%</td>
                      <td className="px-3 py-2 text-xs capitalize">{i.tracking}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${low ? "text-destructive font-semibold" : ""}`}>{qty(i.onHand)} <span className="text-muted-foreground text-xs font-normal">{i.uom}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{qty(i.reorderLevel)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(i.hasBom ? i.rolledCost : i.stdCost)}{i.hasBom && <div className="text-[10px] text-muted-foreground">BOM roll-up</div>}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => setView(i)} aria-label={`Quick view ${i.code}`} title="Quick view">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setEdit(i); setOpen(true); }} aria-label={`Edit ${i.code}`} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <ItemDialog item={edit} open={open} onOpenChange={setOpen} />
      <ItemDetail item={view} onClose={() => setView(null)} />
    </>
  );
}
