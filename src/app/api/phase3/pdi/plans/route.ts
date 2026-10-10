import { api, body } from "@/lib/erp/api";
import { listPlans, savePlan, type PdiPlan } from "@/lib/erp/pdi";

export const GET = api(() => listPlans());

export const POST = api(async (req) => savePlan(await body<PdiPlan>(req)));
