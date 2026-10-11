import { api } from "@/lib/erp/api";
import { listPOs } from "@/lib/erp/phase2";
export const GET = api(() => listPOs());
