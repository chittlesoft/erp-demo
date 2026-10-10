import { api } from "@/lib/erp/api";
import { listPpaps } from "@/lib/erp/phase3";
export const GET = api(() => listPpaps());
