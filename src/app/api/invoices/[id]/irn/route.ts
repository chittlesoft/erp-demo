import { api, body, requireEditor } from "@/lib/erp/api";
import { recordIrn } from "@/lib/erp/phase2";
export const POST = api(async (req, ctx) => {
  await requireEditor(req);
  return recordIrn(Number((await ctx!.params).id), await body(req));
});
