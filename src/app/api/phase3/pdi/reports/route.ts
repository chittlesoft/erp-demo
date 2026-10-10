import { api, body } from "@/lib/erp/api";
import { createReport, listReports, type CreateReportInput } from "@/lib/erp/pdi";

export const GET = api(() => listReports());

export const POST = api(async (req) => createReport(await body<CreateReportInput>(req)));
