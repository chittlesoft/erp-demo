import { api } from "@/lib/erp/api";
import { listInspections } from "@/lib/erp/phase3";
export const GET = api(() => listInspections());
