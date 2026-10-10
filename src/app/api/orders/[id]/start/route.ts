import { api } from "@/lib/erp/api";
import { startOrder } from "@/lib/erp/service";
export const POST = api(async (_req, ctx) => startOrder(Number((await ctx!.params).id)));
