import { api, body } from "@/lib/erp/api";
import { updateItem } from "@/lib/erp/service";

export const PATCH = api(async (req, ctx) => {
  const { id } = await ctx!.params;
  return updateItem(Number(id), await body(req));
});
