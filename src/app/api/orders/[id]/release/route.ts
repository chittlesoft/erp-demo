import { api, requireEditor } from "@/lib/erp/api";
import { releaseOrder } from "@/lib/erp/phase3";
export const POST = api(async (req, ctx) => {
  await requireEditor(req);
  return releaseOrder(Number((await ctx!.params).id));
});
