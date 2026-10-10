import { api } from "@/lib/erp/api";
import { summary } from "@/lib/erp/service";
export const GET = api(() => summary());
