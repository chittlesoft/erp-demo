import { api, requireEditor } from "@/lib/erp/api";
import { deleteBomLine } from "@/lib/erp/service";
export const DELETE = api(async (req, ctx) => {
  await requireEditor(req);
  const { id } = await ctx!.params;
  await deleteBomLine(Number(id));
  return { ok: true };
});
