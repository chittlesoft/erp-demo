import { api, body } from "@/lib/erp/api";
import { completeOrder } from "@/lib/erp/service";
export const POST = api(async (req, ctx) => {
  const { goodQty, rejectQty } = await body<{ goodQty: number; rejectQty: number }>(req);
  return completeOrder(Number((await ctx!.params).id), goodQty, rejectQty);
});
