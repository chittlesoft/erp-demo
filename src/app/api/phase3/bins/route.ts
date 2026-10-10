import { api } from "@/lib/erp/api";
import { listBins } from "@/lib/erp/phase3";
export const GET = api(() => listBins());
