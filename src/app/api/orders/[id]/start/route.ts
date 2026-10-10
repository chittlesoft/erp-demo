import { api } from "@/lib/erp/api";
import { startOrder } from "@/lib/erp/service";
import { logActivity } from "@/lib/erp/activity";

export const POST = api(async (_req, ctx) => {
  const id = Number((await ctx!.params).id);
  const order = await startOrder(id);
  if (order) {
    await logActivity({
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
