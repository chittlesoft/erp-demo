import { api, body, requireEditor } from "@/lib/erp/api";
import { iqcInspect } from "@/lib/erp/phase3";
export const POST = api(async (req) => {
  await requireEditor(req);
  return iqcInspect(await body(req));
});
