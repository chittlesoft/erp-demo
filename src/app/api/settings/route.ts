import { api, body } from "@/lib/erp/api";
import { getSettings, updateSettings } from "@/lib/erp/service";
import { logActivity } from "@/lib/erp/activity";

export const GET = api(() => getSettings());

export const PATCH = api(async (req) => {
  const settings = await updateSettings(await body(req));
  await logActivity({
    module: "settings",
    action: "update",
    refType: "settings",
    refId: "1",
    refIdInt: 1,
    title: "Company settings updated",
  });
  return settings;
});
