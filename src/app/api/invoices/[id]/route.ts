import { api } from "@/lib/erp/api";
import { getInvoice } from "@/lib/erp/phase2";
export const GET = api(async (_req, ctx) => getInvoice(Number((await ctx!.params).id)));
