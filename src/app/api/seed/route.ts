import { api, requireAdmin } from "@/lib/erp/api";
import { ensureSeeded } from "@/lib/erp/seed";
import { logActivityBy } from "@/lib/erp/activity";

// Reseeding wipes + rebuilds all demo data — admin only.
export const POST = api(async (req) => {
  const session = await requireAdmin(req);
  await ensureSeeded(true);
  void logActivityBy(session, {
    module: "seed",
    action: "reseed",
    refType: "seed",
    title: "Demo data reloaded",
    detail: "All demo data was reseeded from the dashboard action.",
  });
  return { ok: true, reseeded: true };
});
