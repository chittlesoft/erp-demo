import { api } from "@/lib/erp/api";
import { listRoutings } from "@/lib/erp/phase3";
export const GET = api(() => listRoutings());
