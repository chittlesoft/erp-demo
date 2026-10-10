import { api, body } from "@/lib/erp/api";
import { createSO } from "@/lib/erp/phase2";
export const POST = api(async (req) => createSO(await body(req)));
