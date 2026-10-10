import { api, body, requireEditor } from "@/lib/erp/api";
import { createGrn } from "@/lib/erp/phase2";
import { logActivityBy } from "@/lib/erp/activity";
import { db } from "@/lib/db";

export const POST = api(async (req) => {
  const session = await requireEditor(req);
  const totals = await createGrn(await body(req));
  // createGrn returns only the computed totals — recover the newest GRN row
  // (the one the transaction just inserted) to log its grnNo.
  const grn = await db.grn.findFirst({
    orderBy: { id: "desc" },
    select: { grnNo: true },
  });
  if (grn) {
    void logActivityBy(session, {
      module: "purchase",
      action: "receive",
      refType: "grn",
      refId: grn.grnNo,
      title: `GRN ${grn.grnNo} received`,
      detail: `Total ₹${Math.round(totals.total)}`,
    });
  }
  return totals;
});
