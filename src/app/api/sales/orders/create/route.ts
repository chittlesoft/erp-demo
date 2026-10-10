import { api, body, requireEditor } from "@/lib/erp/api";
import { createSO } from "@/lib/erp/phase2";
import { logActivityBy } from "@/lib/erp/activity";

export const POST = api(async (req) => {
  const session = await requireEditor(req);
  const so = await createSO(await body(req));
  void logActivityBy(session, {
    module: "sales",
    action: "create",
    refType: "so",
    refId: so.soNo,
    refIdInt: so.id,
    title: `Sales order ${so.soNo} created`,
  });
  return so;
});
