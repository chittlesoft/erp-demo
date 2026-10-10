import { api, body } from "@/lib/erp/api";
import { iqcInspect } from "@/lib/erp/phase3";
export const POST = api(async (req) => iqcInspect(await body(req)));
