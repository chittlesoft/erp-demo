import { api } from "@/lib/erp/api";
import { deleteBomLine } from "@/lib/erp/service";
export const DELETE = api(async (_req, ctx) => {
  const { id } = await ctx!.params;
  await deleteBomLine(Number(id));
  return { ok: true };
});
