import { api, body } from "@/lib/erp/api";
import { createInvoice } from "@/lib/erp/phase2";
export const POST = api(async (req) => createInvoice(await body(req)));
