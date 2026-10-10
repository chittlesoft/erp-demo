import { api, body } from "@/lib/erp/api";
import { updateItem } from "@/lib/erp/service";
import { logActivity } from "@/lib/erp/activity";

export const PATCH = api(async (req, ctx) => {
  const { id } = await ctx!.params;
  const idNum = Number(id);
  const item = await updateItem(idNum, await body(req));
  await logActivity({
    module: "items",
    action: "update",
    refType: "item",
    refId: item.code,
    refIdInt: idNum,
    title: `Item ${item.code} updated`,
  });
  return item;
});
