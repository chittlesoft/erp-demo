import { api } from "@/lib/erp/api";
import { unitInfo } from "@/lib/erp/phase3";
export const GET = api(async (req) => {
  const no = new URL(req.url).searchParams.get("no") ?? "";
  const data = await unitInfo(no);
  if (!data) return { notFound: true };
  return data;
});
