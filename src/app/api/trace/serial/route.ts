import { api } from "@/lib/erp/api";
import { traceSerial } from "@/lib/erp/service";
export const GET = api(async (req) => {
  const no = new URL(req.url).searchParams.get("no") ?? "";
  const data = await traceSerial(no);
  if (!data) return { notFound: true };
  return data;
});
