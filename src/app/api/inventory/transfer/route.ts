import { api, body } from "@/lib/erp/api";
import { transfer } from "@/lib/erp/service";

export const POST = api(async (req) => {
  const { itemId, batchNo, fromWh, toWh, qty, ref } = await body<{
    itemId: number; batchNo: string | null; fromWh: number; toWh: number; qty: number; ref: string;
  }>(req);
  await transfer(itemId, batchNo, fromWh, toWh, qty, ref);
  return { ok: true };
});
