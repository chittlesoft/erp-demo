import { api, body, requireAdmin } from "@/lib/erp/api";
import { getSettings, updateSettings } from "@/lib/erp/service";
import { logActivityBy } from "@/lib/erp/activity";

export const GET = api(() => getSettings());

// Company settings are admin-only (legal name, GSTIN, plant address, GST
// registration details — not for operators/viewers to edit).
export const PATCH = api(async (req) => {
  const session = await requireAdmin(req);
  const settings = await updateSettings(await body(req));
  void logActivityBy(session, {
    module: "settings",
    action: "update",
    refType: "settings",
    refId: "1",
    refIdInt: 1,
    title: "Company settings updated",
  });
  return settings;
});
