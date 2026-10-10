import { api } from "@/lib/erp/api";
import { listGrns } from "@/lib/erp/phase2";
export const GET = api(() => listGrns());
