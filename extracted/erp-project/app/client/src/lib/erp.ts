import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Item, Warehouse, ProductionOrder, StockTxn, Serial, BomLine, Party, Settings, Indent, PurchaseOrder, PoLine, Grn, SalesOrder, SoLine, Invoice, InvoiceLine } from "@shared/schema";

export type ItemRow = Item & { onHand: number; rolledCost: number; hasBom: boolean };
export type StockRow = { itemId: number; warehouseId: number; batchNo: string | null; qty: number };
export type Requirement = { itemId: number; code: string; name: string; uom: string; required: number; available: number; shortage: number };
export type Dashboard = {
  itemCount: number; stockValue: number; openOrders: number; inProgress: number; unitsGood: number; unitsRejected: number; fpy: number | null;
  lowStock: { id: number; code: string; name: string; uom: string; onHand: number; reorderLevel: number }[];
  byLine: { line: string; good: number; reject: number }[];
};
export type { Item, Warehouse, ProductionOrder, StockTxn, Serial, BomLine, Party, Settings, Indent, PurchaseOrder, PoLine, Grn, SalesOrder, SoLine, Invoice, InvoiceLine };
export type PoRow = PurchaseOrder & { lines: PoLine[] };
export type SoRow = SalesOrder & { lines: SoLine[] };
export const useParties = (role?: string) => useQuery<Party[]>({ queryKey: role ? ["/api/parties?role=" + role] : ["/api/parties"] });
export const useSettings = () => useQuery<Settings>({ queryKey: ["/api/settings"] });
export const inr2 = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rupees in words, Indian numbering (lakh / crore) */
export function amountInWords(n: number): string {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""));
  const three = (x: number) => (x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + two(x % 100) : "") : two(x));
  let r = Math.round(n); if (!r) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7); r %= 1e7; const lakh = Math.floor(r / 1e5); r %= 1e5; const th = Math.floor(r / 1e3); r %= 1e3;
  if (crore) parts.push(three(crore) + " Crore"); if (lakh) parts.push(two(lakh) + " Lakh"); if (th) parts.push(two(th) + " Thousand"); if (r) parts.push(three(r));
  return "Rupees " + parts.join(" ") + " Only";
}

export const useItems = () => useQuery<ItemRow[]>({ queryKey: ["/api/items"] });
export const useWarehouses = () => useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });
export const useOrders = () => useQuery<ProductionOrder[]>({ queryKey: ["/api/orders"] });

export function lookup<T extends { id: number }>(rows: T[] | undefined) {
  const m = new Map<number, T>();
  rows?.forEach(r => m.set(r.id, r));
  return m;
}

/** POST/PATCH/DELETE helper with toast + broad cache invalidation (stock affects many views). */
export function useAction<TBody = unknown>(method: string, url: string | ((b: TBody) => string), success?: string) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: TBody) => (await apiRequest(method, typeof url === "function" ? url(body) : url, method === "DELETE" || typeof body !== "object" ? undefined : body)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      if (success) toast({ title: success });
    },
    onError: (e: Error) => {
      let msg = e.message.replace(/^\d+:\s*/, "");
      try { msg = JSON.parse(msg).message ?? msg; } catch {}
      toast({ title: "Action blocked", description: msg, variant: "destructive" });
    },
  });
}

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const qty = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 3 }));
export const LINE_LABEL: Record<string, string> = { NOx: "NOx", EGTS: "EGTS", UQS: "UQS", DeltaP: "Delta P", Lambda: "Lambda" };

// ---------- Phase 3 types & helpers ----------
export type Param = { key: string; label: string; unit: string; min?: number; max?: number; kind?: "num" | "bool" };
export type RouteOp = { seq: number; code: string; name: string; station: string; cycleSec: number; params: Param[] };
export type UnitInfo = {
  unit: { id: number; serial_no: string; status: "QUEUED" | "HOLD" | "DONE" | "SCRAP"; seq: number; rework_count: number; results: Record<string, Record<string, any>> };
  item: { id: number; code: string; name: string; customerPartNo: string | null }; order: { id: number; orderNo: string };
  ops: RouteOp[]; current: RouteOp | null;
  logs: { id: number; seq: number; op_code: string; station: string; operator: string; result: string; data: Record<string, any>; reason: string | null; ts: string }[];
} | null;
export type Board = {
  orders: { order: { id: number; orderNo: string; qty: number; dueDate: string }; item: { code: string; name: string }; ops: { seq: number; name: string; station: string; queued: number; hold: number }[]; done: number; scrap: number; fpy: number | null; canClose: boolean }[];
  stations: { code: string; name: string; queued: number; hold: number; todayDone: number; todayPass: number }[];
  defects: { defect: string; count: number }[];
  recent: { serial: string; station: string; operator: string; result: string; reason: string | null; ts: string; op: string }[];
};
export type Phase3Summary = { wip: number; hold: number; fpyToday: number | null; pendingIqc: number; openNcrs: number; unbinned: number; ppapPending: number };
export const useStations = () => useQuery<Record<string, string>>({ queryKey: ["/api/mes/stations"] });

/** Demo-only bench values: in spec, with an optional chance of one out-of-spec reading */
export function simulateValues(params: Param[], failChance = 0.05) {
  const out: Record<string, any> = {};
  for (const p of params) {
    if (p.kind === "bool") { out[p.key] = true; continue; }
    const lo = p.min ?? (p.max !== undefined ? (p.max > 0 ? p.max * 0.3 : p.max * 1.5) : 0);
    const hi = p.max ?? (p.min !== undefined ? p.min * 3 : 1);
    const span = hi - lo;
    let v = lo + span * (0.15 + Math.random() * 0.7);
    if (Math.random() < failChance) v = hi + span * (0.1 + Math.random() * 0.3);
    out[p.key] = +v.toFixed(span < 5 ? 3 : span < 50 ? 2 : 1);
  }
  return out;
}
export const limitText = (p: Param) => p.kind === "bool" ? "must be OK" : p.min !== undefined && p.max !== undefined ? `${p.min} to ${p.max} ${p.unit}` : p.min !== undefined ? `≥ ${p.min} ${p.unit}` : p.max !== undefined ? `≤ ${p.max} ${p.unit}` : p.unit;
export const inLimit = (p: Param, v: any) => {
  if (p.kind === "bool") return v === true;
  if (v === "" || v === undefined || isNaN(+v)) return null;
  return (p.min === undefined || +v >= p.min) && (p.max === undefined || +v <= p.max);
};
