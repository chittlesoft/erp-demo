import { api, body, requireEditor } from "@/lib/erp/api";
import { createReport, listReports, type CreateReportInput } from "@/lib/erp/pdi";
import { logActivityBy } from "@/lib/erp/activity";

export const GET = api(() => listReports());

export const POST = api(async (req) => {
  const session = await requireEditor(req);
  const report = await createReport(await body<CreateReportInput>(req));
  void logActivityBy(session, {
    module: "pdi",
    action: "inspect",
    refType: "pdi",
    refId: report.pdiNo,
    refIdInt: report.id,
    title: `PDI ${report.pdiNo} ${report.result}`,
    detail: `${report.itemCode} · ${report.customer}`,
  });
  return report;
});
