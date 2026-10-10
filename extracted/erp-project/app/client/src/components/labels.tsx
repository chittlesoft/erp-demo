import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** QR code rendered as inline SVG (works offline, prints crisp). */
export function Qr({ text, size }: { text: string; size: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(s => live && setSvg(s));
    return () => { live = false; };
  }, [text]);
  return <div className="label-qr shrink-0" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label={`QR code ${text}`} />;
}

export type SerialLabel = { serial: string; itemCode: string; itemName: string; customerPartNo: string | null; orderNo: string; date: string };
export type BinLabel = { code: string; zone: string; store: string };

function SerialCard({ l }: { l: SerialLabel }) {
  return (
    <div className="label label-serial">
      <Qr text={l.serial} size="19mm" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[6.5pt] font-semibold tracking-wide">TAU POWER</div>
        <div className="font-mono text-[7pt]">{l.itemCode}</div>
        {l.customerPartNo && <div className="text-[6pt]">OEM P/N <span className="font-mono">{l.customerPartNo}</span></div>}
        <div className="font-mono text-[9pt] font-bold mt-[1mm] break-all">{l.serial}</div>
        <div className="text-[5.5pt] text-neutral-600">{l.orderNo} · {l.date}</div>
      </div>
    </div>
  );
}
function BinCard({ l }: { l: BinLabel }) {
  return (
    <div className="label label-bin">
      <Qr text={`BIN:${l.code}`} size="30mm" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[7pt] font-semibold tracking-wide">TAU POWER · {l.store}</div>
        <div className="font-mono text-[22pt] font-bold mt-[1mm]">{l.code}</div>
        <div className="text-[8pt] text-neutral-600">{l.zone}</div>
      </div>
    </div>
  );
}

/** Preview dialog + print-only portal. Serial sheet: 3 × 7 labels (63.5 × 38.1 mm, A4). Bin sheet: 2 × 5 labels (99 × 57 mm). */
export function LabelsDialog({ open, onClose, title, description, serials, bins }: {
  open: boolean; onClose: () => void; title: string; description?: string; serials?: SerialLabel[]; bins?: BinLabel[];
}) {
  useEffect(() => {
    if (!open) return;
    const after = () => document.body.classList.remove("print-labels");
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("afterprint", after); after(); };
  }, [open]);
  if (!open) return null;
  const sheet = (
    <div className={serials ? "label-sheet sheet-serial" : "label-sheet sheet-bin"}>
      {serials?.map(l => <SerialCard key={l.serial} l={l} />)}
      {bins?.map(l => <BinCard key={l.code} l={l} />)}
    </div>
  );
  const count = serials?.length ?? bins?.length ?? 0;
  return (
    <>
      <Dialog open onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-neutral-100 dark:bg-neutral-900 p-3" data-testid="label-preview">
            <div className="label-screen bg-white text-black mx-auto shadow-sm">{sheet}</div>
          </div>
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-xs text-muted-foreground">{count} label{count === 1 ? "" : "s"} · A4 sheet {serials ? "3 × 7 (63.5 × 38.1 mm)" : "2 × 5 (99 × 57 mm)"} · QR encodes {serials ? "the serial number" : "BIN:<code>"}</span>
            <Button onClick={() => { document.body.classList.add("print-labels"); setTimeout(() => window.print(), 50); }} disabled={!count} data-testid="button-print-labels"><Printer className="h-4 w-4 mr-1" />Print labels</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {createPortal(<div id="label-print-root">{sheet}</div>, document.body)}
    </>
  );
}
