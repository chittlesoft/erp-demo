import { api, body } from "@/lib/erp/api";
import { listOrders, createOrder } from "@/lib/erp/service";

export const GET = api(() => listOrders());
export const POST = api(async (req) => {
  const d = await body<{ itemId: number; qty: number; dueDate: string; warehouseId: number }>(req);
  return createOrder(d);
});
