import { api } from "@/lib/erp/api";
import { listNcrs } from "@/lib/erp/phase3";
export const GET = api(() => listNcrs());
