import { api, body } from "@/lib/erp/api";
import { getSettings, updateSettings } from "@/lib/erp/service";
export const GET = api(() => getSettings());
export const PATCH = api(async (req) => updateSettings(await body(req)));
