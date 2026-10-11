"use client";
import { useMemo } from "react";
import { Printer, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
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

/** Compact totals row: label left, value right-aligned with tabular-nums. */
function TotalsRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline gap-3 ${emphasis ? "border-t pt-1.5 mt-1 font-semibold text-sm" : ""}`}>
      <span className={emphasis ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
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

  // Print-time stamp computed once per loaded invoice; shown only in the
  // print footer. Keyed on invoice?.id so it doesn't shift on every parent
  // re-render / HMR tick.
  const printedAt = useMemo(
    () => new Date().toLocaleString("en-IN"),
    [invoice?.id],
  );

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

  // Ship-to is identical to bill-to for this ERP (no separate shipping
  // address on the Invoice row), so we omit a separate ship-to block.
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
        {/* Dialog header (chrome — hidden when printing) */}
        <div className="flex items-start justify-between no-print">
          <DialogTitle>
            Tax invoice{invoice ? ` · ${invoice.invNo}` : ""}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => printInvoice()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
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
              text-[13px] print:text-[11px]
            "
          >
            {/* ---- Title bar: TAX INVOICE centred + inv no/date right ---- */}
            <div className="flex items-end justify-between pb-2 border-b">
              <div className="text-lg font-bold tracking-tight print:text-base">
                TAX INVOICE
              </div>
              <div className="text-right text-xs print:text-[10px]">
                <div>
                  Invoice no:{" "}
                  <span className="font-mono font-medium">{invoice.invNo}</span>
                </div>
                <div className="text-muted-foreground">Date: {invoice.date}</div>
                <div className="text-muted-foreground">
                  SO: <span className="font-mono">{invoice.so?.soNo ?? "—"}</span>
                  {invoice.so?.customerPo ? ` · Cust PO ${invoice.so.customerPo}` : ""}
                </div>
              </div>
            </div>

            {/* ---- Parties: Seller (left) | Bill to (right) — side-by-side ---- */}
            <div className="grid grid-cols-2 gap-4 py-3 border-b">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Seller
                </div>
                <div className="text-sm font-semibold print:text-[12px]">
                  {settings?.legalName || "Tau Power Electronics"}
                </div>
                <div className="text-xs text-muted-foreground print:text-[10px]">
                  {settings?.address || "—"}
                </div>
                <div className="text-xs text-muted-foreground print:text-[10px]">
                  {settings?.city}
                  {settings?.pincode ? ` — ${settings.pincode}` : ""}
                </div>
                <div className="text-xs mt-1">
                  GSTIN:{" "}
                  <span className="font-mono font-medium">
                    {settings?.gstin || "—"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground print:text-[10px]">
                  State: {settings ? stateName(settings.stateCode) : "—"}
                  {settings?.phone ? ` · ${settings.phone}` : ""}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Bill to
                </div>
                <div className="text-sm font-semibold print:text-[12px]">
                  {invoice.customer.name}
                </div>
                <div className="text-xs text-muted-foreground print:text-[10px]">
                  {invoice.customer.address}
                </div>
                <div className="text-xs text-muted-foreground print:text-[10px]">
                  {invoice.customer.city} — {invoice.customer.pincode}
                </div>
                <div className="text-xs mt-1">
                  GSTIN:{" "}
                  <span className="font-mono font-medium">
                    {invoice.customer.gstin}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground print:text-[10px]">
                  State: {stateName(invoice.customer.stateCode)} · Place of supply:{" "}
                  {stateName(invoice.placeOfSupply)}
                </div>
              </div>
            </div>

            {/* ---- Transport (compact single row) ---- */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 py-2 border-b text-xs print:text-[10px]">
              <span>
                Vehicle:{" "}
                <span className="font-mono">{invoice.vehicleNo || "—"}</span>
              </span>
              <span>Transporter: {invoice.transporter || "—"}</span>
              <span>Distance: {invoice.distanceKm} km</span>
            </div>

            {/* ---- Line items + totals side-by-side (totals stay visible) ---- */}
            <div className="grid lg:grid-cols-[1fr_220px] gap-4 mt-3 print:grid-cols-[1fr_200px]">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-xs zebra print:text-[10px]">
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
                          <th className="font-medium px-2 py-1.5 text-right">CGST</th>
                          <th className="font-medium px-2 py-1.5 text-right">SGST</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={`${l.soLineId}-${i}`} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <div className="font-mono text-[11px] print:text-[10px]">{l.code}</div>
                          <div className="text-[11px] text-muted-foreground print:text-[10px]">{l.name}</div>
                          {l.customerPartNo && (
                            <div className="text-[10px] text-muted-foreground print:text-[9px]">
                              OEM: {l.customerPartNo}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px] print:text-[10px]">{l.hsn}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {qty(l.qty)} {l.uom}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{inr2(l.rate)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{inr2(l.taxable)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{l.gstRate}%</td>
                        {isInterState ? (
                          <td className="px-2 py-1.5 text-right tabular-nums">{inr2(l.igst)}</td>
                        ) : (
                          <>
                            <td className="px-2 py-1.5 text-right tabular-nums">{inr2(l.cgst)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{inr2(l.sgst)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals block — sticky on screen, always visible alongside the table */}
              <div className="lg:sticky lg:top-0 self-start text-xs print:text-[10px]">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <TotalsRow label="Taxable amount" value={inr2(invoice.taxable)} />
                  {isInterState ? (
                    <TotalsRow label="IGST" value={inr2(invoice.igst)} />
                  ) : (
                    <>
                      <TotalsRow label="CGST" value={inr2(invoice.cgst)} />
                      <TotalsRow label="SGST" value={inr2(invoice.sgst)} />
                    </>
                  )}
                  {invoice.roundOff !== 0 && (
                    <TotalsRow label="Round off" value={inr2(invoice.roundOff)} />
                  )}
                  <TotalsRow label="Grand total" value={inr2(invoice.total)} emphasis />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground italic print:text-[10px]">
                  Amount in words:{" "}
                  <span className="font-medium not-italic">
                    {amountInWords(invoice.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* ---- Serial numbers dispatched ---- */}
            {allSerials.length > 0 && (
              <div className="mt-3 p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Serial numbers dispatched ({allSerials.length})
                </div>
                <div className="font-mono text-[11px] break-words print:text-[10px]">
                  {formatSerialRange(allSerials)}
                </div>
              </div>
            )}

            {/* ---- IRN / Ack / EWB ---- */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs print:text-[10px]">
              <div className="p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">IRN</div>
                <div className="font-mono text-[11px] truncate print:text-[10px]" title={invoice.irn ?? ""}>
                  {invoice.irn ?? "—"}
                </div>
              </div>
              <div className="p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ack no</div>
                <div className="font-mono text-[11px] truncate print:text-[10px]" title={invoice.ackNo ?? ""}>
                  {invoice.ackNo ?? "—"}
                </div>
              </div>
              <div className="p-2 border rounded">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">E-way bill</div>
                <div className="font-mono text-[11px] truncate print:text-[10px]" title={invoice.ewbNo ?? ""}>
                  {invoice.ewbNo ?? "—"}
                </div>
              </div>
            </div>

            {/* ---- Signature ---- */}
            <div className="mt-6 flex justify-between items-end text-xs print:text-[10px]">
              <div className="text-muted-foreground italic">
                This is a computer-generated invoice.
              </div>
              <div className="text-center">
                <div className="border-t w-40 pt-1 mt-8">Authorised signatory</div>
              </div>
            </div>

            {/*
              Running print footer — fixed to the bottom of every printed A4
              page (per the .print-footer rule in globals.css). Carries the
              document title, invoice no, print timestamp and a CSS-counter
              "Page X of Y" via the .print-footer-page element. Hidden on
              screen (.print-only). Mirrors the PDI report's print footer so
              the two printable documents share a consistent metadata strip.
            */}
            <div className="print-only print-footer flex items-center justify-between gap-4">
              <span className="font-mono">
                Tax Invoice{invoice ? ` · ${invoice.invNo}` : ""}
              </span>
              <span className="font-mono">Printed: {printedAt}</span>
              <span className="print-footer-page font-mono" aria-hidden />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
