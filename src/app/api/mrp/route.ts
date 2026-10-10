import { api } from "@/lib/erp/api";
import { mrp } from "@/lib/erp/service";
export const GET = api(() => mrp());
