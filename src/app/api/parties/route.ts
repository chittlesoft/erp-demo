import { api, body, requireEditor } from "@/lib/erp/api";
import { listParties, createParty } from "@/lib/erp/phase2";

export const GET = api(async (req) => {
  const role = new URL(req.url).searchParams.get("role") ?? undefined;
  return listParties(role);
});
export const POST = api(async (req) => {
  await requireEditor(req);
  return createParty(await body(req));
});
