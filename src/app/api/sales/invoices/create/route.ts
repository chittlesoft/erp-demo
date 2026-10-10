import { api, body } from "@/lib/erp/api";
import { createInvoice } from "@/lib/erp/phase2";
import { assert as pdiAssert, link as pdiLink } from "@/lib/erp/pdi";
import { db } from "@/lib/db";

type CreateInvoiceInput = {
  soId: number;
  lines: { soLineId: number; qty: number }[];
  vehicleNo: string | null;
  transporter: string | null;
  distanceKm: number;
};

export const POST = api(async (req) => {
  const input = await body<CreateInvoiceInput>(req);
  // PDI dispatch gate — blocks the dispatch (and thus invoice creation) until
  // every line whose part has a PDI plan is covered by accepted, un-invoiced
  // PDI reports. The api() wrapper turns the thrown ErpError into a 400 with
  // a message like "Dispatch blocked: pre-dispatch inspection pending for ...".
  await pdiAssert(input.soId, input.lines);
  const totals = await createInvoice(input);
  // After the invoice is created, link accepted un-invoiced PDI reports to it
  // (sets PdiReport.invoiceNo up to the dispatched qty). createInvoice returns
  // only the totals, so we look up the newest ACTIVE invoice for this SO to
  // recover its id + invNo (the very row the transaction just inserted).
  const inv = await db.invoice.findFirst({
    where: { soId: input.soId, status: "ACTIVE" },
    orderBy: { id: "desc" },
    select: { id: true, invNo: true },
  });
  if (inv) await pdiLink(input.soId, input.lines, inv.id, inv.invNo);
  return totals;
});
