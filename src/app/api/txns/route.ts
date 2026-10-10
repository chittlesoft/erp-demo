import { api } from "@/lib/erp/api";
import { listTxns } from "@/lib/erp/service";
export const GET = api(async (req) => {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  return listTxns(limit ? Number(limit) : undefined);
});
