import { api } from "@/lib/erp/api";
import { listActivity } from "@/lib/erp/activity";

// GET /api/activity?limit=50&module=sales&from=2026-10-01&to=2026-10-31&user=admin@taupower.in
//   limit  — default 50, clamped to 1..200
//   module — optional module filter (items|bom|inventory|production|purchase|
//            sales|quality|pdi|shopfloor|settings|seed). "all" or omitted = no filter.
//   from   — optional ISO date or date-time; rows with ts >= from are returned.
//            Bare YYYY-MM-DD is normalised to start-of-day UTC.
//   to     — optional ISO date or date-time; rows with ts <= to are returned.
//            Bare YYYY-MM-DD is normalised to end-of-day UTC.
//   user   — optional exact-match email (or "system") filter on the user column.
//   On first read the table is lazily seeded with ~18 representative entries.
export const GET = api(async (req) => {
  const url = new URL(req.url, "http://localhost");
  const limitParam = url.searchParams.get("limit");
  const moduleParam = url.searchParams.get("module") ?? undefined;
  const fromParam = url.searchParams.get("from") ?? undefined;
  const toParam = url.searchParams.get("to") ?? undefined;
  const userParam = url.searchParams.get("user") ?? undefined;
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  return listActivity(
    Number.isFinite(limit) ? limit : 50,
    moduleParam ?? undefined,
    fromParam || undefined,
    toParam || undefined,
    userParam || undefined,
  );
});
