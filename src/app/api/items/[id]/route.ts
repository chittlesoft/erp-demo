import { api, body, requireEditor } from "@/lib/erp/api";
import { updateItem } from "@/lib/erp/service";
import { logActivityBy } from "@/lib/erp/activity";

export const PATCH = api(async (req, ctx) => {
  const session = await requireEditor(req);
  const { id } = await ctx!.params;
  const idNum = Number(id);
  const item = await updateItem(idNum, await body(req));
  void logActivityBy(session, {
    module: "items",
    action: "update",
    refType: "item",
    refId: item.code,
    refIdInt: idNum,
    title: `Item ${item.code} updated`,
  });
  return item;
});
