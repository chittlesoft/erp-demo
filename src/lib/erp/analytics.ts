// Phase 4 analytics service: management dashboards (OEE, FPY, order book, inventory ageing).
import { db } from "@/lib/db";
import { today } from "./shared";

export async function analytics() {
  const [orders, sos, wip, logs, bins, items, whs, txns] = await Promise.all([
    db.productionOrder.findMany({ include: { item: true } }),
    db.salesOrder.findMany({ include: { customer: true, lines: { include: { item: true } } } }),
    db.wipUnit.findMany(),
    db.opLog.findMany(),
    db.bin.findMany(),
    db.item.findMany(),
    db.warehouse.findMany(),
    db.stockTxn.findMany(),
  ]);

  // OEE by station (demo: availability 85%, performance 92%, quality from pass rate)
  const stations = new Map<string, { station: string; scans: number; pass: number; oee: number }>();
  for (const l of logs) {
    const s = stations.get(l.station) ?? { station: l.station, scans: 0, pass: 0, oee: 0 };
    s.scans++; if (l.result === "PASS") s.pass++;
    stations.set(l.station, s);
  }
  for (const s of stations.values()) s.oee = +(0.85 * 0.92 * (s.scans ? s.pass / s.scans : 0) * 100).toFixed(1);

  // FPY by product
  const fpyByProduct = new Map<string, { line: string; good: number; reject: number; fpy: number }>();
  for (const o of orders.filter(o => o.status === "COMPLETED")) {
    const line = o.item.productLine ?? "Other";
    const r = fpyByProduct.get(line) ?? { line, good: 0, reject: 0, fpy: 0 };
    r.good += o.goodQty; r.reject += o.rejectQty;
    fpyByProduct.set(line, r);
  }
  for (const r of fpyByProduct.values()) r.fpy = r.good + r.reject ? +(100 * r.good / (r.good + r.reject)).toFixed(1) : 0;

  // Order book by customer + due bucket
  const todayStr = today();
  const orderBook = sos.filter(s => s.status !== "CLOSED").map(s => {
    const remaining = s.lines.reduce((sum, l) => sum + (l.qty - l.dispatchedQty) * l.rate, 0);
    const due = s.deliveryDate;
    const bucket = due < todayStr ? "Overdue" : due <= addDays(todayStr, 7) ? "0-7 days" : due <= addDays(todayStr, 30) ? "8-30 days" : "30+ days";
    return { customer: s.customer.name, soNo: s.soNo, value: Math.round(remaining), bucket, due };
  });

  // Inventory ageing
  const stock = new Map<string, { itemId: number; batchNo: string | null; warehouseCode: string; qty: number; ageDays: number; value: number }>();
  const itemMap = new Map(items.map(i => [i.id, i]));
  const whMap = new Map(whs.map(w => [w.id, w]));
  const blocked = new Set(whs.filter(w => ["QC", "REJ", "JW"].includes(w.code)).map(w => w.id));
  for (const t of txns) {
    if (blocked.has(t.warehouseId)) continue;
    const key = `${t.itemId}|${t.batchNo ?? ""}|${t.warehouseId}`;
    const r = stock.get(key) ?? { itemId: t.itemId, batchNo: t.batchNo, warehouseCode: whMap.get(t.warehouseId)?.code ?? "", qty: 0, ageDays: 0, value: 0 };
    r.qty += t.qty;
    if (t.qty > 0) r.ageDays = Math.max(r.ageDays, Math.floor((Date.now() - new Date(t.date).getTime()) / 86400000));
    stock.set(key, r);
  }
  const ageing = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const oldestBatches: { code: string; batch: string; age: number; qty: number; value: number }[] = [];
  for (const r of stock.values()) {
    if (r.qty <= 0.001) continue;
    const it = itemMap.get(r.itemId);
    const value = r.qty * (it?.stdCost ?? 0);
    if (r.ageDays <= 30) ageing["0-30"] += value;
    else if (r.ageDays <= 60) ageing["31-60"] += value;
    else if (r.ageDays <= 90) ageing["61-90"] += value;
    else ageing["90+"] += value;
    oldestBatches.push({ code: it?.code ?? "", batch: r.batchNo ?? "", age: r.ageDays, qty: r.qty, value });
  }
  oldestBatches.sort((a, b) => b.age - a.age);

  return {
    oee: Array.from(stations.values()).sort((a, b) => b.oee - a.oee),
    fpyByProduct: Array.from(fpyByProduct.values()),
    orderBook,
    ageing,
    oldestBatches: oldestBatches.slice(0, 8),
    wipTotal: wip.length,
    scrapTotal: wip.filter(w => w.status === "SCRAP").length,
  };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
