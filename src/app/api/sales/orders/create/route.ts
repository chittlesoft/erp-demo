import { api, body } from "@/lib/erp/api";
import { createSO } from "@/lib/erp/phase2";
import { logActivity } from "@/lib/erp/activity";

export const POST = api(async (req) => {
  const so = await createSO(await body(req));
  await logActivity({
    module: "sales",
    action: "create",
    refType: "so",
    refId: so.soNo,
    refIdInt: so.id,
    title: `Sales order ${so.soNo} created`,
  });
  return so;
});
