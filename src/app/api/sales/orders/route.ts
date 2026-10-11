import { api } from "@/lib/erp/api";
import { listSOs } from "@/lib/erp/phase2";
export const GET = api(() => listSOs());
