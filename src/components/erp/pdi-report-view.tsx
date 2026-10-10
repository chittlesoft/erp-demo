"use client";
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
 * Mirrors the layout of the reference Tau Power PDI sheets. */
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

  return (
    <Dialog
      open={reportId !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> PDI report
          </DialogTitle>
        </DialogHeader>

        {reportId === null ? null : isLoading || !r ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="overflow-x-auto">
            <div className="pdi-sheet bg-white text-black mx-auto w-[190mm] min-w-[190mm] p-[6mm] shadow-sm print:shadow-none print:p-0 text-[11pt] print-area">
              {/* Title block */}
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

              {/* Top info grid */}
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

              {/* Characteristics + readings */}
              <table className="w-full table-fixed border-collapse border-2 border-black text-[10pt] mt-[4mm] zebra">
                <colgroup>
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "14%" }} />
                  {Array.from({ length: r.sample }, (_, i) => (
                    <col key={i} style={{ width: `${35 / r.sample}%` }} />
                  ))}
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} className="border border-black px-1 py-1">Sr.No.</th>
                    <th rowSpan={2} className="border border-black px-1 py-1">Description</th>
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
                    return (
                      <tr key={c.sr} className="text-center">
                        <td className="border border-black px-1 py-1">{c.sr}</td>
                        <td className="border border-black px-1 py-1">{c.description}</td>
                        <td className="border border-black px-1 py-1">{specText(c)}</td>
                        <td className="border border-black px-1 py-1">{c.method}</td>
                        {Array.from({ length: r.sample }, (_, i) => (
                          <td key={i} className="border border-black px-0.5 py-1 tabular-nums">
                            {rd?.values[i] ?? ""}
                          </td>
                        ))}
                        <td className="border border-black font-semibold px-1 py-1">{rd?.ok ? "OK" : ""}</td>
                        <td className="border border-black font-semibold px-1 py-1">{rd && !rd.ok ? "NG" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Note */}
              <div className="border-2 border-t-0 border-black min-h-[22mm] p-2 text-[10pt]">
                <span className="font-semibold">Note if any:</span> {r.note}
              </div>

              {/* Footer */}
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
                    {r.result === "ACCEPT" ? "ACCEPTED" : "REJECTED"}
                  </span>
                </div>
              </div>

              <div className="text-right text-[8.5pt] font-semibold mt-2">{PDI_DOC}</div>
            </div>
          </div>
        )}

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
