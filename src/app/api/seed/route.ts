import { api } from "@/lib/erp/api";
import { ensureSeeded } from "@/lib/erp/seed";
import { logActivity } from "@/lib/erp/activity";

export const POST = api(async () => {
  await ensureSeeded(true);
  await logActivity({
    module: "seed",
    action: "reseed",
    refType: "seed",
    title: "Demo data reloaded",
    detail: "All demo data was reseeded from the dashboard action.",
  });
  return { ok: true, reseeded: true };
});
