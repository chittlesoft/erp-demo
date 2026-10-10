import { api, body, requireEditor } from "@/lib/erp/api";
import { disposition } from "@/lib/erp/phase3";
export const POST = api(async (req) => {
  await requireEditor(req);
  return disposition(await body(req));
});
