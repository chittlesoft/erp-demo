import { api, body } from "@/lib/erp/api";
import { scanUnit } from "@/lib/erp/phase3";
import { logActivity } from "@/lib/erp/activity";

export const POST = api(async (req) => {
  const input = await body<Parameters<typeof scanUnit>[0]>(req);
  const result = await scanUnit(input);
  await logActivity({
    module: "shopfloor",
    action: "scan",
    refType: "serial",
    refId: input.serialNo,
    title: `${input.serialNo} scanned ${result.result}`,
    detail: `Operator: ${input.operator}`,
  });
  return result;
});
