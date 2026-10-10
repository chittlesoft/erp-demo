import { api, body } from "@/lib/erp/api";
import { createPO } from "@/lib/erp/phase2";
import { logActivity } from "@/lib/erp/activity";

export const POST = api(async (req) => {
  const po = await createPO(await body(req));
  await logActivity({
    module: "purchase",
    action: "create",
    refType: "po",
    refId: po.poNo,
    refIdInt: po.id,
    title: `Purchase order ${po.poNo} created`,
  });
  return po;
});
