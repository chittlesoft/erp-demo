import { api, body, requireEditor } from "@/lib/erp/api";
import { listItems, createItem } from "@/lib/erp/service";
import { logActivityBy } from "@/lib/erp/activity";

export const GET = api(() => listItems());

export const POST = api(async (req) => {
  const session = await requireEditor(req);
  const item = await createItem(await body(req));
  void logActivityBy(session, {
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
