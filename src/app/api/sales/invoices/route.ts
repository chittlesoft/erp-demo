import { api } from "@/lib/erp/api";
import { listInvoices } from "@/lib/erp/phase2";
export const GET = api(() => listInvoices());
