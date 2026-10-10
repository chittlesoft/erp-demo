import { api, body } from "@/lib/erp/api";
import { listIndents, createIndent } from "@/lib/erp/phase2";
export const GET = api(() => listIndents());
export const POST = api(async (req) => createIndent(await body(req)));
