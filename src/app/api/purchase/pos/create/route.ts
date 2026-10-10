import { api, body, requireEditor } from "@/lib/erp/api";
import { createPO } from "@/lib/erp/phase2";
import { logActivityBy } from "@/lib/erp/activity";

export const POST = api(async (req) => {
  const session = await requireEditor(req);
  const po = await createPO(await body(req));
  void logActivityBy(session, {
    module: "purchase",
    action: "create",
    refType: "po",
    refId: po.poNo,
    refIdInt: po.id,
    title: `Purchase order ${po.poNo} created`,
  });
  return po;
});
