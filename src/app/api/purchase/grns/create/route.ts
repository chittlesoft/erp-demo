import { api, body } from "@/lib/erp/api";
import { createGrn } from "@/lib/erp/phase2";
import { logActivity } from "@/lib/erp/activity";
import { db } from "@/lib/db";

export const POST = api(async (req) => {
  const totals = await createGrn(await body(req));
  // createGrn returns only the computed totals — recover the newest GRN row
  // (the one the transaction just inserted) to log its grnNo.
  const grn = await db.grn.findFirst({
    orderBy: { id: "desc" },
    select: { grnNo: true },
  });
  if (grn) {
    await logActivity({
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
