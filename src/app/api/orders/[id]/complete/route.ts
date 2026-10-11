import { api, body, requireEditor } from "@/lib/erp/api";
import { completeOrder } from "@/lib/erp/service";
import { logActivityBy } from "@/lib/erp/activity";

export const POST = api(async (req, ctx) => {
  const session = await requireEditor(req);
  const id = Number((await ctx!.params).id);
  const { goodQty, rejectQty } = await body<{ goodQty: number; rejectQty: number }>(req);
  const order = await completeOrder(id, goodQty, rejectQty);
  if (order) {
    void logActivityBy(session, {
      module: "production",
      action: "complete",
      refType: "order",
      refId: order.orderNo,
      refIdInt: id,
      title: `Production order ${order.orderNo} completed`,
      detail: `${goodQty} good · ${rejectQty} rejected`,
    });
  }
  return order;
});
