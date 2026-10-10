import { api } from "@/lib/erp/api";
import { traceBatch } from "@/lib/erp/service";
export const GET = api(async (req) => {
  const no = new URL(req.url).searchParams.get("no") ?? "";
  return traceBatch(no);
});
