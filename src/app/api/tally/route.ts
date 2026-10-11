import { api } from "@/lib/erp/api";
import { tallyExport } from "@/lib/erp/phase2";
export const GET = api(async (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "2026-04-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  return tallyExport(from, to);
});
