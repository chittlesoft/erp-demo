import { api } from "@/lib/erp/api";
import { releaseOrder } from "@/lib/erp/phase3";
export const POST = api(async (_req, ctx) => releaseOrder(Number((await ctx!.params).id)));
