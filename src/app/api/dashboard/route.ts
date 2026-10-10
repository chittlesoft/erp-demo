import { api } from "@/lib/erp/api";
import { dashboard } from "@/lib/erp/service";
export const GET = api(() => dashboard());
