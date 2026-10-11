import { api, body, requireEditor } from "@/lib/erp/api";
import { scanUnit } from "@/lib/erp/phase3";
import { logActivityBy } from "@/lib/erp/activity";

export const POST = api(async (req) => {
  const session = await requireEditor(req);
  const input = await body<Parameters<typeof scanUnit>[0]>(req);
  const result = await scanUnit(input);
  void logActivityBy(session, {
    module: "shopfloor",
    action: "scan",
    refType: "serial",
    refId: input.serialNo,
    title: `${input.serialNo} scanned ${result.result}`,
    detail: `Operator: ${input.operator}`,
  });
  return result;
});
