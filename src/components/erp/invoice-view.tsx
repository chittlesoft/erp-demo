"use client";
import { useMemo } from "react";
import { Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, inr2, qty, amountInWords } from "@/lib/erp/client";
import { STATES, type InvoiceLine } from "@/lib/erp/shared";
import { printInvoice, formatSerialRange } from "@/lib/erp/print";

// Local typed view of GET /api/invoices/[id]. The route returns the Prisma
// Invoice row with `customer` and `so` joined; `lines` is stored as a JSON
// string of InvoiceLine[] on the Invoice row, so we parse it client-side.
interface InvoiceParty {
  id: number;
  name: string;
  gstin: string;
  stateCode: string;
  address: string;
  city: string;
  pincode: string;
}
interface InvoiceSo {
  id: number;
  soNo: string;
  customerPo: string;
}
interface InvoiceDetail {
  id: number;
  invNo: string;
  date: string;
  placeOfSupply: string;
  lines: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  vehicleNo: string | null;
  transporter: string | null;
  distanceKm: number;
  irn: string | null;
  ackNo: string | null;
  ewbNo: string | null;
  status: string;
  customer: InvoiceParty;
  so: InvoiceSo;
}
interface CompanySettings {
  legalName: string;
  gstin: string;
  stateCode: string;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  email: string;
}

/** Parse the JSON `lines` string defensively — never throws. */
function safeParseLines(raw: string | undefined | null): InvoiceLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as InvoiceLine[];
  } catch {
    return [];
  }
}

/** Print-friendly tax invoice rendered inside a Dialog. `invoiceId === null`
 * means the dialog is closed. Parent should mount this conditionally when an
 * invoice id is selected so the inner useApi only fires when open. */
export function InvoiceView({
  invoiceId,
  onClose,
}: {
  invoiceId: number | null;
  onClose: () => void;
}) {
  const { data: invoice, isLoading } = useApi<InvoiceDetail>(
    `/api/invoices/${invoiceId ?? 0}`,
    invoiceId !== null,
  );
  const { data: settings } = useApi<CompanySettings>("/api/settings");

  const lines = useMemo<InvoiceLine[]>(
    () => (invoice ? safeParseLines(invoice.lines) : []),
    [invoice],
  );
  const allSerials = useMemo<string[]>(
    () => lines.flatMap((l) => l.serials ?? []),
    [lines],
  );
  const isInterState = !!invoice && invoice.igst > 0;
  const stateName = (code: string) => STATES[code] ?? code;

  return (
    <Dialog
      open={invoiceId !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="
          max-w-4xl
          print:max-w-none print:w-full print:max-h-none print:inset-0
          print:translate-x-0 print:translate-y-0 print:top-0 print:left-0
          print:rounded-none print:border-0 print:shadow-none print:p-0
        "
      >
        <div className="flex items-start justify-between no-print">
          <DialogHeader className="text-left">
            <DialogTitle>
              Tax invoice{invoice ? ` · ${invoice.invNo}` : ""}
            </DialogTitle>
          </DialogHeader>
          <Button variant="outline" size="sm" onClick={() => printInvoice()}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
        </div>

        {isLoading || !invoice ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div
            className="
              print-area max-h-[75vh] overflow-y-auto scroll-thin pr-1
              print:max-h-none print:overflow-visible print:pr-0
            "
          >
            {/* ---- Header: seller (left) + invoice no/date (right) ---- */}
            <div className="grid grid-cols-2 gap-4 pb-3 border-b">
              <div>
                <div className="text-base font-semibold">
                  {settings?.legalName || "Tau Power Electronics"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {settings?.address || "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {settings?.city}
                  {settings?.pincode ? ` — ${settings.pincode}` : ""}
                </div>
                <div className="text-xs mt-1">
                  GSTIN:{" "}
                  <span className="font-mono">
                    {settings?.gstin || "—"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  State: {settings ? stateName(settings.stateCode) : "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold tracking-tight">
                  TAX INVOICE
                </div>
                <div className="text-sm mt-1">
                  Invoice no:{" "}
                  <span className="font-mono font-medium">
                    {invoice.invNo}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Date: {invoice.date}
                </div>
                <div className="text-xs text-muted-foreground">
                  SO:{" "}
                  <span className="font-mono">{invoice.so?.soNo ?? "—"}</span>
                </div>
                {invoice.so?.customerPo && (
                  <div className="text-xs text-muted-foreground">
                    Customer PO: {invoice.so.customerPo}
                  </div>
                )}
              </div>
            </div>

            {/* ---- Bill to + transport ---- */}
            <div className="grid grid-cols-2 gap-4 py-3 border-b">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Bill to
                </div>
                <div className="text-sm font-medium">
                  {invoice.customer.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {invoice.customer.address}
                </div>
                <div className="text-xs text-muted-foreground">
                  {invoice.customer.city} — {invoice.customer.pincode}
                </div>
                <div className="text-xs">
                  GSTIN:{" "}
                  <span className="font-mono">{invoice.customer.gstin}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  State: {stateName(invoice.customer.stateCode)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Place of supply: {stateName(invoice.placeOfSupply)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Transport
                </div>
                <div className="text-xs">
                  Vehicle:{" "}
                  <span className="font-mono">
                    {invoice.vehicleNo || "—"}
                  </span>
                </div>
                <div className="text-xs">
                  Transporter: {invoice.transporter || "—"}
                </div>
                <div className="text-xs">
                  Distance: {invoice.distanceKm} km
                </div>
              </div>
            </div>

            {/* ---- Line items ---- */}
            <table className="w-full text-xs mt-3 zebra">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
                  <th className="font-medium px-2 py-1.5 text-left">#</th>
                  <th className="font-medium px-2 py-1.5 text-left">Item</th>
                  <th className="font-medium px-2 py-1.5 text-left">HSN</th>
                  <th className="font-medium px-2 py-1.5 text-right">Qty</th>
                  <th className="font-medium px-2 py-1.5 text-right">Rate</th>
                  <th className="font-medium px-2 py-1.5 text-right">Taxable</th>
                  <th className="font-medium px-2 py-1.5 text-right">GST%</th>
                  {isInterState ? (
                    <th className="font-medium px-2 py-1.5 text-right">IGST</th>
                  ) : (
                    <>
                      <th className="font-medium px-2 py-1.5 text-right">
                        CGST
                      </th>
                      <th className="font-medium px-2 py-1.5 text-right">
                        SGST
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.soLineId}-${i}`} className="border-b last:border-0">
                    <td className="px-2 py-1.5 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[11px]">{l.code}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {l.name}
                      </div>
                      {l.customerPartNo && (
                        <div className="text-[10px] text-muted-foreground">
                          OEM: {l.customerPartNo}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[11px]">{l.hsn}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {qty(l.qty)} {l.uom}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {inr2(l.rate)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {inr2(l.taxable)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {l.gstRate}%
                    </td>
                    {isInterState ? (
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {inr2(l.igst)}
                      </td>
                    ) : (
                      <>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {inr2(l.cgst)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {inr2(l.sgst)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ---- Totals ---- */}
            <div className="flex justify-end mt-3">
              <div className="w-64 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxable amount</span>
                  <span className="tabular-nums">
                    {inr2(invoice.taxable)}
                  </span>
                </div>
                {isInterState ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGST</span>
                    <span className="tabular-nums">{inr2(invoice.igst)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST</span>
                      <span className="tabular-nums">{inr2(invoice.cgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST</span>
                      <span className="tabular-nums">{inr2(invoice.sgst)}</span>
                    </div>
                  </>
                )}
                {invoice.roundOff !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Round off</span>
                    <span className="tabular-nums">
                      {inr2(invoice.roundOff)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Grand total</span>
                  <span className="tabular-nums">{inr2(invoice.total)}</span>
                </div>
              </div>
            </div>

            {/* ---- Amount in words ---- */}
            <div className="mt-3 text-xs text-muted-foreground italic">
              Amount in words:{" "}
              <span className="font-medium not-italic">
                {amountInWords(invoice.total)}
              </span>
            </div>

            {/* ---- Serial numbers dispatched ---- */}
            {allSerials.length > 0 && (
              <div className="mt-3 p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Serial numbers dispatched ({allSerials.length})
                </div>
                <div className="font-mono text-[11px] break-words">
                  {formatSerialRange(allSerials)}
                </div>
              </div>
            )}

            {/* ---- IRN / Ack / EWB ---- */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  IRN
                </div>
                <div
                  className="font-mono text-[11px] truncate"
                  title={invoice.irn ?? ""}
                >
                  {invoice.irn ?? "—"}
                </div>
              </div>
              <div className="p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Ack no
                </div>
                <div
                  className="font-mono text-[11px] truncate"
                  title={invoice.ackNo ?? ""}
                >
                  {invoice.ackNo ?? "—"}
                </div>
              </div>
              <div className="p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  E-way bill
                </div>
                <div
                  className="font-mono text-[11px] truncate"
                  title={invoice.ewbNo ?? ""}
                >
                  {invoice.ewbNo ?? "—"}
                </div>
              </div>
            </div>

            {/* ---- Signature ---- */}
            <div className="mt-6 flex justify-between items-end text-xs">
              <div className="text-muted-foreground italic">
                This is a computer-generated invoice.
              </div>
              <div className="text-center">
                <div className="border-t w-40 pt-1 mt-8">Authorised signatory</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="no-print">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
