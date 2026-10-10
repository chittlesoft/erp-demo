import { api } from "@/lib/erp/api";
import { ensureSeeded } from "@/lib/erp/seed";
export const POST = api(async () => { await ensureSeeded(true); return { ok: true, reseeded: true }; });
