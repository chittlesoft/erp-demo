import { api } from "@/lib/erp/api";
import { getOrder } from "@/lib/erp/service";
export const GET = api(async (_req, ctx) => getOrder(Number((await ctx!.params).id)));
