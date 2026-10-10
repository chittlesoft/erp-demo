import { api, body } from "@/lib/erp/api";
import { scanUnit } from "@/lib/erp/phase3";
export const POST = api(async (req) => scanUnit(await body(req)));
