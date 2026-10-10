import { api } from "@/lib/erp/api";
import { listSerials } from "@/lib/erp/service";
export const GET = api(async (req) => {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  return listSerials(limit ? Number(limit) : undefined);
});
