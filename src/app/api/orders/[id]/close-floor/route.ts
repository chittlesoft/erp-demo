import { api, requireEditor } from "@/lib/erp/api";
import { closeOrderFromFloor } from "@/lib/erp/phase3";
export const POST = api(async (req, ctx) => {
  await requireEditor(req);
  return closeOrderFromFloor(Number((await ctx!.params).id));
});
