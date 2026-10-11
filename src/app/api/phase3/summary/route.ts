import { api } from "@/lib/erp/api";
import { phase3Summary } from "@/lib/erp/phase3";
export const GET = api(() => phase3Summary());
