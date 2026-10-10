import { api, requireEditor } from "@/lib/erp/api";
import { startOrder } from "@/lib/erp/service";
import { logActivityBy } from "@/lib/erp/activity";

export const POST = api(async (req, ctx) => {
  const session = await requireEditor(req);
  const id = Number((await ctx!.params).id);
  const order = await startOrder(id);
  if (order) {
    void logActivityBy(session, {
      module: "production",
      action: "start",
      refType: "order",
      refId: order.orderNo,
      refIdInt: id,
      title: `Production order ${order.orderNo} started`,
    });
  }
  return order;
});
