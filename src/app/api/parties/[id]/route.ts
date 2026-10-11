import { api, body, requireEditor } from "@/lib/erp/api";
import { updateParty } from "@/lib/erp/phase2";
export const PATCH = api(async (req, ctx) => {
  await requireEditor(req);
  return updateParty(Number((await ctx!.params).id), await body(req));
});
