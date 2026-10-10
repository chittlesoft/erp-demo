"use client";
// Client-side data hooks (React Query) + API helpers for the ERP.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { inr as _inr, qty as _qty, inr2 as _inr2, amountInWords as _amountInWords, LINE_LABEL, TYPE_LABEL } from "./shared";

export { _inr as inr, _qty as qty, _inr2 as inr2, _amountInWords as amountInWords, LINE_LABEL, TYPE_LABEL };

export async function apiRequest(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message ?? text; } catch {}
    throw new Error(msg);
  }
  return { json: async () => (text ? JSON.parse(text) : {}) };
}

// Generic query hook
export function useApi<T>(key: string, enabled = true) {
  return useQuery<T>({
    queryKey: [key],
    queryFn: async () => (await apiRequest("GET", key)).json() as T,
    enabled,
    staleTime: 15000,
  });
}

export const queryKeys = {
  dashboard: "/api/dashboard",
  summary: "/api/summary",
  items: "/api/items",
  bom: "/api/bom",
  warehouses: "/api/warehouses",
  inventory: "/api/inventory",
  txns: "/api/txns",
  orders: "/api/orders",
  serials: "/api/serials",
  mrp: "/api/mrp",
  settings: "/api/settings",
  parties: "/api/parties",
  indents: "/api/purchase/indents",
  pos: "/api/purchase/pos",
  grns: "/api/purchase/grns",
  sos: "/api/sales/orders",
  invoices: "/api/sales/invoices",
  tally: "/api/tally",
  board: "/api/phase3/board",
  summary3: "/api/phase3/summary",
  routings: "/api/phase3/routings",
  inspections: "/api/phase3/inspections",
  ncrs: "/api/phase3/ncrs",
  ppaps: "/api/phase3/ppaps",
  bins: "/api/phase3/bins",
  analytics: "/api/analytics",
};

/** POST/PATCH/DELETE helper with toast + broad cache invalidation. */
export function useAction<TBody = unknown>(
  method: string,
  url: string | ((b: TBody) => string),
  success?: string,
) {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TBody) =>
      (await apiRequest(method, typeof url === "function" ? url(body) : url, method === "DELETE" || typeof body !== "object" ? undefined : body)).json(),
    onSuccess: () => {
      qc.invalidateQueries();
      if (success) toast({ title: success });
    },
    onError: (e: Error) => {
      toast({ title: "Action blocked", description: e.message, variant: "destructive" });
    },
  });
}

export function lookup<T extends { id: number }>(rows: T[] | undefined) {
  const m = new Map<number, T>();
  rows?.forEach((r) => m.set(r.id, r));
  return m;
}
