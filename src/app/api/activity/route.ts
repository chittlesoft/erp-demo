import { api } from "@/lib/erp/api";
import { listActivity } from "@/lib/erp/activity";

// GET /api/activity?limit=50&module=sales
//   limit  — default 50, clamped to 1..200
//   module — optional module filter (items|bom|inventory|production|purchase|
//            sales|quality|pdi|shopfloor|settings|seed). "all" or omitted = no filter.
//   On first read the table is lazily seeded with ~18 representative entries.
export const GET = api(async (req) => {
  const url = new URL(req.url, "http://localhost");
  const limitParam = url.searchParams.get("limit");
  const moduleParam = url.searchParams.get("module") ?? undefined;
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  return listActivity(Number.isFinite(limit) ? limit : 50, moduleParam ?? undefined);
});
