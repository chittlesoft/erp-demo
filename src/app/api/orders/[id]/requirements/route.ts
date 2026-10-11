import { api } from "@/lib/erp/api";
import { orderRequirements } from "@/lib/erp/service";
export const GET = api(async (_req, ctx) => orderRequirements(Number((await ctx!.params).id)));
