"use client";
import { useMemo } from "react";
import { Printer, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/erp/client";
import { StatusBadge } from "./shared";
import {
  specText,
  dmy,
  PDI_DOC,
  type PdiReportDetail,
} from "@/lib/erp/pdi-shared";

/** Print-friendly dialog showing a completed PDI report (format TPE/IMS/FR/78).
 * Mirrors the layout of the reference Tau Power PDI sheets, with an A4-sized
 * printable sheet that flows across pages for long characteristic tables. */
export function PdiReportView({
  reportId,
  onClose,
}: {
  reportId: number | null;
  onClose: () => void;
}) {
  const { data: r, isLoading } = useApi<PdiReportDetail>(
    reportId != null ? `/api/phase3/pdi/reports/${reportId}` : "/api/phase3/pdi/reports/_none",
    reportId != null,
  );

  const accepted = r?.result === "ACCEPT";
  // Print-time stamp computed once per render of the loaded report; stored
  // in a memo so it doesn't shift on every parent re-render (it would
  // otherwise update on each HMR tick / parent state change). Shown only in
  // the print footer.
  const printedAt = useMemo(
    () => new Date().toLocaleString("en-IN"),
    [r?.id],
  );

  return (
    <Dialog
      open={reportId !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="
          max-w-5xl
          print:max-w-none print:w-full print:max-h-none print:inset-0
          print:translate-x-0 print:translate-y-0 print:top-0 print:left-0
          print:rounded-none print:border-0 print:shadow-none print:p-0
        "
      >
        {/* Header chrome — hidden when printing */}
        <DialogHeader className="no-print flex flex-row items-center justify-between sm:space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> PDI report
            {r && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Result <StatusBadge status={r.result} />
              </span>
            )}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={() => window.print()} disabled={!r}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>
        </DialogHeader>

        {reportId === null ? null : isLoading || !r ? (
          <Skeleton className="h-96" />
        ) : (
          <div
            className="
              print-area pdi-landscape max-h-[75vh] overflow-y-auto scroll-thin pr-1
              print:max-h-none print:overflow-visible print:pr-0
            "
          >
            <div className="pdi-report bg-white text-black mx-auto w-[190mm] min-w-[190mm] p-[6mm] shadow-sm print:shadow-none print:w-full print:min-w-0 print:max-w-none print:p-0 text-[11pt]">
              {/* ---- Result banner (top, prominent) ---- */}
              <div
                className={`mb-3 flex items-center justify-between rounded-md border-2 px-3 py-2 text-center font-bold text-[12pt] ${
                  accepted
                    ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                    : "border-rose-700 bg-rose-50 text-rose-800"
                }`}
              >
                <span className="text-[9pt] font-semibold uppercase tracking-wider">
                  Overall result
                </span>
                <span className="tracking-wide">
                  {accepted ? "ACCEPTED" : "REJECTED"}
                </span>
                <span className="font-mono text-[10pt] font-semibold">{r.pdiNo}</span>
              </div>

              {/* ---- Title block (τ logo + company + report title) ---- */}
              <table className="w-full border-collapse border-2 border-black">
                <tbody>
                  <tr>
                    <td className="border-2 border-black w-[28%] text-center align-bottom px-2 py-1">
                      <div className="font-serif text-[44pt] leading-none">τ</div>
                      <div className="text-[8.5pt] font-semibold mt-1 whitespace-nowrap">
                        Tau Power Electronics Pvt. Ltd.
                      </div>
                    </td>
                    <td className="border-2 border-black text-center text-[20pt] font-bold tracking-tight px-2">
                      Pre Dispatch Inspection Report
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ---- Top info grid (3 logical columns of label/value pairs) ---- */}
              <table className="w-full border-collapse border-2 border-t-0 border-black text-[10pt]">
                <tbody>
                  <tr>
                    <td className="border border-black w-[22%] font-semibold px-2 py-1">Part Name</td>
                    <td className="border border-black px-2 py-1" colSpan={2}>{r.itemName}</td>
                    <td className="border border-black w-[18%] font-semibold px-2 py-1">PDI No.</td>
                    <td className="border border-black font-mono px-2 py-1">{r.pdiNo}</td>
                  </tr>
                  <tr>
                    <td className="border border-black font-semibold px-2 py-1">Part No</td>
                    <td className="border border-black font-mono px-2 py-1" colSpan={2}>
                      {r.itemCode}
                      {r.customerPartNo && (
                        <div className="text-[8pt] font-sans">Customer part no. {r.customerPartNo}</div>
                      )}
                    </td>
                    <td className="border border-black font-semibold px-2 py-1">PDI Qty.</td>
                    <td className="border border-black tabular-nums px-2 py-1">{String(r.qty).padStart(2, "0")}</td>
                  </tr>
                  <tr>
                    <td className="border border-black font-semibold px-2 py-1">Drg. Rev. No &amp; Date</td>
                    <td className="border border-black w-[8%] text-center px-2 py-1">{r.drgRev}</td>
                    <td className="border border-black text-center tabular-nums px-2 py-1">{dmy(r.drgDate)}</td>
                    <td className="border border-black font-semibold px-2 py-1">Sampling No.</td>
                    <td className="border border-black tabular-nums px-2 py-1">{String(r.sample).padStart(2, "0")}</td>
                  </tr>
                  <tr>
                    <td className="border border-black font-semibold px-2 py-1">Reference Standard</td>
                    <td className="border border-black text-center px-2 py-1" colSpan={2}>{r.refStandard || "-"}</td>
                    <td className="border border-black font-semibold px-2 py-1">PDI Date</td>
                    <td className="border border-black tabular-nums px-2 py-1">{dmy(r.date)}</td>
                  </tr>
                  <tr>
                    <td className="border border-black font-semibold px-2 py-1">Material Test Report</td>
                    <td className="border border-black px-2 py-1">Yes {r.mtr && <span className="font-bold">✓</span>}</td>
                    <td className="border border-black px-2 py-1">No {!r.mtr && <span className="font-bold">✓</span>}</td>
                    <td className="border border-black font-semibold px-2 py-1">Customer Name</td>
                    <td className="border border-black px-2 py-1">{r.customer}</td>
                  </tr>
                  <tr>
                    <td className="border border-black font-semibold px-2 py-1">Sales Order</td>
                    <td className="border border-black font-mono px-2 py-1" colSpan={2}>{r.soNo}</td>
                    <td className="border border-black font-semibold px-2 py-1">Invoice No</td>
                    <td className="border border-black font-mono px-2 py-1">{r.invoiceNo ?? ""}</td>
                  </tr>
                  <tr>
                    <td className="border border-black font-semibold px-2 py-1">Inspected by</td>
                    <td className="border border-black px-2 py-1" colSpan={2}>{r.inspector}</td>
                    <td className="border border-black font-semibold px-2 py-1">Invoice Date</td>
                    <td className="border border-black tabular-nums px-2 py-1">{r.invoiceDate ? dmy(r.invoiceDate) : ""}</td>
                  </tr>
                </tbody>
              </table>

              {/* ---- Characteristics + readings ---- */}
              <table className="w-full table-fixed border-collapse border-2 border-t-0 border-black text-[10pt] mt-[4mm] zebra table-compact">
                <colgroup>
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  {Array.from({ length: r.sample }, (_, i) => (
                    <col key={i} style={{ width: `${34 / r.sample}%` }} />
                  ))}
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} className="border border-black px-1 py-1">Sr.No.</th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-left">Description</th>
                    <th rowSpan={2} className="border border-black px-1 py-1">Specification</th>
                    <th rowSpan={2} className="border border-black px-1 py-1">Inspection Method</th>
                    {Array.from({ length: r.sample }, (_, i) => (
                      <th key={i} rowSpan={2} className="border border-black px-1 py-1">{i + 1}</th>
                    ))}
                    <th colSpan={2} className="border border-black px-1 py-1">Remark</th>
                  </tr>
                  <tr>
                    <th className="border border-black text-[9pt] px-1 py-1">Accept</th>
                    <th className="border border-black text-[9pt] px-1 py-1">Reject</th>
                  </tr>
                </thead>
                <tbody>
                  {r.chars.map((c) => {
                    const rd = r.readings.find((x) => x.sr === c.sr);
                    const rowOk = rd?.ok;
                    return (
                      <tr key={c.sr} className="text-center">
                        <td className="border border-black px-1 py-1 tabular-nums">{c.sr}</td>
                        <td className="border border-black px-1 py-1 text-left">{c.description}</td>
                        <td className="border border-black px-1 py-1">{specText(c)}</td>
                        <td className="border border-black px-1 py-1">{c.method}</td>
                        {Array.from({ length: r.sample }, (_, i) => (
                          <td key={i} className="border border-black px-0.5 py-1 text-right tabular-nums">
                            {rd?.values[i] ?? ""}
                          </td>
                        ))}
                        <td
                          className={`border border-black font-semibold px-1 py-1 ${
                            rowOk ? "text-emerald-700" : ""
                          }`}
                        >
                          {rd?.ok ? "OK" : ""}
                        </td>
                        <td
                          className={`border border-black font-semibold px-1 py-1 ${
                            rd && !rd.ok ? "text-rose-700" : ""
                          }`}
                        >
                          {rd && !rd.ok ? "NG" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ---- Note ---- */}
              <div className="border-2 border-t-0 border-black min-h-[22mm] p-2 text-[10pt]">
                <span className="font-semibold">Note if any:</span> {r.note}
              </div>

              {/* ---- Footer (sign-off blocks) ---- */}
              <div className="grid grid-cols-3 border-2 border-t-0 border-black text-[9pt]">
                <div className="p-2 border-r border-black">
                  PDI no. <span className="font-mono">{r.pdiNo}</span>
                  <br />
                  Date {dmy(r.date)}
                </div>
                <div className="p-2 border-r border-black">
                  Inspected by
                  <br />
                  <span className="font-semibold">{r.inspector}</span>
                </div>
                <div className="p-2">
                  Result
                  <br />
                  <span className="font-bold">
                    {accepted ? "ACCEPTED" : "REJECTED"}
                  </span>
                </div>
              </div>

              <div className="text-right text-[8.5pt] font-semibold mt-2">{PDI_DOC}</div>

              {/*
                Running print footer — fixed to the bottom of every printed
                A4 page (per the .print-footer rule in globals.css). Carries
                the document number, print timestamp, inspector name, and a
                CSS-counter "Page X of Y" via the .print-footer-page element.
                Hidden on screen (.print-only).
              */}
              <div className="print-only print-footer flex items-center justify-between gap-4">
                <span className="font-mono">{PDI_DOC}, Rev.01</span>
                <span className="font-mono">
                  Inspector: {r.inspector} · Printed: {printedAt}
                </span>
                <span className="print-footer-page font-mono" aria-hidden />
              </div>
            </div>
          </div>
        )}

        {/* Footer chrome — hidden when printing (Print/Close mirrored in header for accessibility) */}
        <DialogFooter className="no-print items-center gap-3">
          {r && (
            <span className="text-sm mr-auto">
              Result <StatusBadge status={r.result} />
            </span>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!r}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
