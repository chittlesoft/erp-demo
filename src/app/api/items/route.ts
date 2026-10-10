import { api, body } from "@/lib/erp/api";
import { listItems, createItem, updateItem } from "@/lib/erp/service";

export const GET = api(() => listItems());
export const POST = api(async (req) => createItem(await body(req)));
