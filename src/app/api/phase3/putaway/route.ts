import { api, body } from "@/lib/erp/api";
import { putAway } from "@/lib/erp/phase3";
export const POST = api(async (req) => putAway(await body(req)));
