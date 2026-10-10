import { api, body, requireEditor } from "@/lib/erp/api";
import { listPlans, savePlan, type PdiPlan } from "@/lib/erp/pdi";

export const GET = api(() => listPlans());

export const POST = api(async (req) => {
  await requireEditor(req);
  return savePlan(await body<PdiPlan>(req));
});
