import { api, body } from "@/lib/erp/api";
import { createPO } from "@/lib/erp/phase2";
export const POST = api(async (req) => createPO(await body(req)));
