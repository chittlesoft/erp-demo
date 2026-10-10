"use client";
import { useMemo, useState } from "react";
import { Plus, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useApi, useAction, lookup, inr2, qty } from "@/lib/erp/client";
import type { ItemRow, Party, SalesOrder, SoLine, Invoice } from "@/lib/erp/shared";
import { PageIntro, Empty, StatusBadge } from "../shared";
import { ExportButton } from "../export-button";
import { InvoiceView } from "../invoice-view";

const SO_COLS = ["SO no.", "Customer", "Cust. PO", "Delivery", "Value", "Dispatched", "Status", ""];
const INV_COLS = ["Invoice", "Date", "Customer", "Taxable", "GST", "Total", "IRN", ""];
const DISP_COLS = ["Item", "Order", "Dispatched", "Pending", "Now"];

const INV_CSV_COLUMNS = [
  { key: "invNo", header: "Invoice no" },
  { key: "date", header: "Date" },
  { key: "customer", header: "Customer" },
  { key: "soNo", header: "SO no" },
  { key: "taxable", header: "Taxable (INR)" },
  { key: "gst", header: "GST (INR)" },
  { key: "total", header: "Total (INR)" },
  { key: "irn", header: "IRN" },
  { key: "status", header: "Status" },
] as const;

function thClass(i: number, rightCols: number[]) {
  return `font-medium px-5 py-2 ${rightCols.includes(i) ? "text-right" : "text-left"}`;
}

export default function SalesPage() {
  const { data: sos } = useApi<
    (SalesOrder & { customer: Party; lines: (SoLine & { item: ItemRow })[]; invoices: Invoice[] })[]
  >("/api/sales/orders");
  const { data: invoices } = useApi<(Invoice & { customer: Party; so: SalesOrder })[]>("/api/sales/invoices");
  const { data: items } = useApi<ItemRow[]>("/api/items");
  const { data: customers } = useApi<Party[]>("/api/parties?role=CUSTOMER");

  return (
    <>
      <PageIntro>
        OEM sales orders, dispatch from finished goods with FIFO serial allocation, and tax invoices with
        HSN, OEM part numbers, serial ranges, and CGST/SGST or IGST. E-invoice JSON export and IRN recording.
      </PageIntro>
      <Tabs defaultValue="so">
        <TabsList>
          <TabsTrigger value="so">Sales orders</TabsTrigger>
          <TabsTrigger value="inv">Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="so" className="mt-4">
          <SOList sos={sos ?? []} items={items ?? []} customers={customers ?? []} />
        </TabsContent>
        <TabsContent value="inv" className="mt-4">
          <InvoiceList invoices={invoices ?? []} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function SOList({ sos, items, customers }: { sos: (SalesOrder & { customer: Party; lines: (SoLine & { item: ItemRow })[]; invoices: Invoice[] })[]; items: ItemRow[]; customers: Party[] }) {
  const [open, setOpen] = useState(false);
  const [dispSo, setDispSo] = useState<SalesOrder | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2 flex items-center">
        <h2 className="text-sm font-semibold">Sales orders</h2>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />New SO
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin">
        {sos.length === 0 ? (
          <Empty>No sales orders</Empty>
        ) : (
          <table className="w-full text-sm zebra">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {SO_COLS.map((h, i) => (
                  <th key={i} className={thClass(i, [4, 5])}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sos.map((so) => {
                const value = so.lines.reduce((s, l) => s + l.qty * l.rate, 0);
                const dispatched = so.lines.reduce((s, l) => s + l.dispatchedQty * l.rate, 0);
                const overdue = so.status !== "CLOSED" && so.deliveryDate < todayStr;
                return (
                  <tr key={so.id} className="border-b last:border-0">
                    <td className="px-5 py-2 font-mono text-xs">{so.soNo}</td>
                    <td className="px-5">{so.customer.name}</td>
                    <td className="px-5 text-xs font-mono">{so.customerPo}</td>
                    <td className="px-5 text-xs tabular-nums">
                      {so.deliveryDate}
                      {overdue && <span className="ml-1 text-destructive font-medium">overdue</span>}
                    </td>
                    <td className="px-5 text-right tabular-nums">{inr2(value)}</td>
                    <td className="px-5 text-right tabular-nums">{inr2(dispatched)}</td>
                    <td className="px-5"><StatusBadge status={so.status} /></td>
                    <td className="px-5 text-right">
                      {so.status !== "CLOSED" && (
                        <Button size="sm" variant="outline" onClick={() => setDispSo(so)}>
                          <Truck className="h-3.5 w-3.5 mr-1" />Dispatch
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <SODialog open={open} onOpenChange={setOpen} items={items} customers={customers} />
      {dispSo && <DispatchDialog so={dispSo} onClose={() => setDispSo(null)} />}
    </div>
  );
}

function SODialog({ open, onOpenChange, items, customers }: { open: boolean; onOpenChange: (o: boolean) => void; items: ItemRow[]; customers: Party[] }) {
  const [customerId, setCustomerId] = useState("");
  const [customerPo, setCustomerPo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [lines, setLines] = useState<{ itemId: string; qty: string; rate: string }[]>([{ itemId: "", qty: "", rate: "" }]);
  const create = useAction("POST", "/api/sales/orders/create", "Sales order created");

  const submit = () => {
    const payload = {
      customerId: Number(customerId),
      customerPo,
      deliveryDate,
      lines: lines
        .filter((l) => l.itemId && l.qty)
        .map((l) => ({ itemId: Number(l.itemId), qty: Number(l.qty), rate: Number(l.rate) })),
    };
    create.mutate(payload as never, { onSuccess: () => onOpenChange(false) });
  };

  const updateLine = (i: number, patch: Partial<{ itemId: string; qty: string; rate: string }>) =>
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New sales order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Customer PO no.</Label>
              <Input className="mt-1" value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Delivery date</Label>
            <Input type="date" className="mt-1 w-48" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Lines</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-7">
                  <Select
                    value={l.itemId}
                    onValueChange={(v) => {
                      const rate = l.rate || String(items.find((it) => it.id === Number(v))?.stdCost ?? "");
                      updateLine(i, { itemId: v, rate });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {items.map((it) => (
                        <SelectItem key={it.id} value={String(it.id)}>{it.code} — {it.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input className="col-span-2" type="number" placeholder="Qty" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} />
                <Input className="col-span-2" type="number" placeholder="Rate" value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { itemId: "", qty: "", rate: "" }])}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add line
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!customerId || !customerPo || create.isPending}>Create SO</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DispatchDialog({ so, onClose }: { so: SalesOrder; onClose: () => void }) {
  const { data: sos } = useApi<(SalesOrder & { customer: Party; lines: (SoLine & { item: ItemRow })[] })[]>("/api/sales/orders");
  const fullSo = sos?.find((s) => s.id === so.id);
  const [vehicleNo, setVehicleNo] = useState("");
  const [transporter, setTransporter] = useState("");
  const [distanceKm, setDistanceKm] = useState("0");
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const create = useAction("POST", "/api/sales/invoices/create", "Invoice created — serials dispatched");

  const submit = () => {
    const payload = {
      soId: so.id,
      lines: (fullSo?.lines ?? [])
        .filter((l) => Number(qtys[l.id] ?? 0) > 0)
        .map((l) => ({ soLineId: l.id, qty: Number(qtys[l.id]) })),
      vehicleNo: vehicleNo || null,
      transporter: transporter || null,
      distanceKm: Number(distanceKm),
    };
    create.mutate(payload as never, { onSuccess: () => onClose() });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Dispatch &amp; invoice — {so.soNo}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Allocate IN_STOCK serials FIFO. E-way bill required when invoice value exceeds the threshold (inter-state job work always).
          </div>
          <table className="w-full text-sm border rounded-md">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {DISP_COLS.map((h, i) => (
                  <th key={i} className={`font-medium px-3 py-1.5 ${i >= 1 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(fullSo?.lines ?? []).map((l) => {
                const pending = l.qty - l.dispatchedQty;
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-xs">{l.item.code}</span>
                      <span className="text-xs text-muted-foreground block">{l.item.name}</span>
                    </td>
                    <td className="px-3 text-right tabular-nums">{qty(l.qty)}</td>
                    <td className="px-3 text-right tabular-nums">{qty(l.dispatchedQty)}</td>
                    <td className="px-3 text-right tabular-nums text-muted-foreground">{qty(pending)}</td>
                    <td className="px-3">
                      <Input
                        type="number"
                        min="0"
                        max={pending}
                        className="h-8 w-20 ml-auto"
                        value={qtys[l.id] ?? ""}
                        onChange={(e) => setQtys((q) => ({ ...q, [l.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Vehicle no.</Label>
              <Input className="mt-1" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="MH12 XX 1234" />
            </div>
            <div>
              <Label className="text-xs">Transporter</Label>
              <Input className="mt-1" value={transporter} onChange={(e) => setTransporter(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Distance (km)</Label>
              <Input type="number" className="mt-1" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceList({ invoices }: { invoices: (Invoice & { customer: Party; so: SalesOrder })[] }) {
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const csvRows = useMemo(
    () =>
      invoices.map((inv) => ({
        invNo: inv.invNo,
        date: inv.date,
        customer: inv.customer?.name ?? "",
        soNo: inv.so?.soNo ?? "",
        taxable: inv.taxable,
        gst: inv.cgst + inv.sgst + inv.igst,
        total: inv.total,
        irn: inv.irn ?? "",
        status: inv.status,
      })),
    [invoices],
  );
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <div className="px-5 pt-4 pb-2 flex items-center">
        <h2 className="text-sm font-semibold">Tax invoices</h2>
        <div className="ml-auto">
          <ExportButton filename="tau-invoices" rows={csvRows} columns={[...INV_CSV_COLUMNS]} />
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin">
        {invoices.length === 0 ? (
          <Empty>No invoices</Empty>
        ) : (
          <table className="w-full text-sm zebra">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {INV_COLS.map((h, i) => (
                  <th key={i} className={thClass(i, [3, 4, 5])}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const gst = inv.cgst + inv.sgst + inv.igst;
                return (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="px-5 py-2 font-mono text-xs">
                      <button
                        type="button"
                        className="link-inline"
                        onClick={() => setViewInvoiceId(inv.id)}
                        title={`View invoice ${inv.invNo}`}
                      >
                        {inv.invNo}
                      </button>
                    </td>
                    <td className="px-5 text-xs tabular-nums">{inv.date}</td>
                    <td className="px-5">{inv.customer.name}</td>
                    <td className="px-5 text-right tabular-nums">{inr2(inv.taxable)}</td>
                    <td className="px-5 text-right tabular-nums text-muted-foreground">{inr2(gst)}</td>
                    <td className="px-5 text-right tabular-nums font-medium">{inr2(inv.total)}</td>
                    <td className="px-5"><StatusBadge status={inv.irn ? "IRN_OK" : "IRN_PENDING"} /></td>
                    <td className="px-5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setViewInvoiceId(inv.id)}>View</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <InvoiceView invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />
    </div>
  );
}
