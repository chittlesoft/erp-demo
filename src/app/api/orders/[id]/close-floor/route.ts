import { api } from "@/lib/erp/api";
import { closeOrderFromFloor } from "@/lib/erp/phase3";
export const POST = api(async (_req, ctx) => closeOrderFromFloor(Number((await ctx!.params).id)));
