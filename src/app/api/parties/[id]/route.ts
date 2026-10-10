import { api, body } from "@/lib/erp/api";
import { updateParty } from "@/lib/erp/phase2";
export const PATCH = api(async (req, ctx) => updateParty(Number((await ctx!.params).id), await body(req)));
