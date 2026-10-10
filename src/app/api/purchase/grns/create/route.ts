import { api, body } from "@/lib/erp/api";
import { createGrn } from "@/lib/erp/phase2";
export const POST = api(async (req) => createGrn(await body(req)));
