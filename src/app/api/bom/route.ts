import { api, body, requireEditor } from "@/lib/erp/api";
import { listBom, addBomLine } from "@/lib/erp/service";

export const GET = api(async (req) => {
  const url = new URL(req.url);
  const parent = url.searchParams.get("parentId");
  return listBom(parent ? Number(parent) : undefined);
});

export const POST = api(async (req) => {
  await requireEditor(req);
  return addBomLine(await body(req));
});
