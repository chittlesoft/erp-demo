import { api } from "@/lib/erp/api";
import { stockByBatch, listWarehouses, onHandMap } from "@/lib/erp/service";

export const GET = api(async () => {
  const [rows, whs, stock] = await Promise.all([stockByBatch(), listWarehouses(), onHandMap()]);
  const whMap = new Map(whs.map(w => [w.id, w]));
  return rows
    .filter(r => r.qty > 0.0001)
    .map(r => ({
      ...r,
      warehouseCode: whMap.get(r.warehouseId)?.code ?? "",
      warehouseName: whMap.get(r.warehouseId)?.name ?? "",
    }));
});
