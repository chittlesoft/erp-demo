import { api, body } from "@/lib/erp/api";
import { listItems, createItem, updateItem } from "@/lib/erp/service";
import { logActivity } from "@/lib/erp/activity";

export const GET = api(() => listItems());

export const POST = api(async (req) => {
  const item = await createItem(await body(req));
  await logActivity({
    module: "items",
    action: "create",
    refType: "item",
    refId: item.code,
    refIdInt: item.id,
    title: `Item ${item.code} created`,
    detail: item.name,
  });
  return item;
});
