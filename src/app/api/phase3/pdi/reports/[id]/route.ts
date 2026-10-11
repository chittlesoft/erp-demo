import { api } from "@/lib/erp/api";
import { getReport } from "@/lib/erp/pdi";

export const GET = api(async (_req, ctx) => getReport(Number((await ctx!.params).id)));
