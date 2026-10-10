import { api, body } from "@/lib/erp/api";
import { recordIrn } from "@/lib/erp/phase2";
export const POST = api(async (req, ctx) => recordIrn(Number((await ctx!.params).id), await body(req)));
