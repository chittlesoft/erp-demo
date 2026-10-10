import { api, body } from "@/lib/erp/api";
import { disposition } from "@/lib/erp/phase3";
export const POST = api(async (req) => disposition(await body(req)));
