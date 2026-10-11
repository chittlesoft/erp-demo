import { api } from "@/lib/erp/api";
import { listWarehouses } from "@/lib/erp/service";
export const GET = api(() => listWarehouses());
