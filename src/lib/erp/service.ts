// Core business-logic service for the Tau Power ERP.
// Ported from the original Express/Drizzle `DatabaseStorage` + phase2/3/4 modules,
// adapted to Prisma + Next.js Route Handlers.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  PREFIX, ErpError, fyNo, roundQty, simulatedEol, today,
  type Dashboard, type ItemRow, type Requirement, type StockRow, type Summary, type InvoiceLine,
} from "./shared";

const BLOCKED_WH = ["QC", "REJ", "JW"];

// ---------- helpers ----------
function parse<T = unknown>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

async function nextDocNo(prefix: string, table: "invoices" | "purchase_orders" | "sales_orders" | "grns" | "indents" | "job_work_challans" | "notes"): Promise<number> {
  // Count existing rows of this FY-prefix family (INV/26-27/*) to produce a sequential number.
  const yy = (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1).toString().slice(2);
  const yy2 = (new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear()).toString().slice(2);
  const like = `${prefix}/${yy}-${yy2}/%`;
  const rows = await db.$queryRaw<{ n: number }[]>(
    Prisma.sql`SELECT COUNT(*) as n FROM ${Prisma.raw(table)} WHERE ${Prisma.raw(table === "invoices" ? "inv_no" : table === "purchase_orders" ? "po_no" : table === "sales_orders" ? "so_no" : table === "grns" ? "grn_no" : table === "indents" ? "indent_no" : table === "job_work_challans" ? "challan_no" : "note_no")} LIKE ${like}`,
  );
  return (rows[0]?.n ?? 0) + 1;
}

// =====================================================================
//  Items
// =====================================================================
export async function listItems(): Promise<ItemRow[]> {
  const items = await db.item.findMany({ orderBy: { code: "asc" } });
  const stock = await onHandMap();
  await loadBomCache();
  const costMap = new Map(items.map(i => [i.id, i.stdCost]));
  const bomParents = new Set((await db.bomLine.findMany({ select: { parentItemId: true } })).map(b => b.parentItemId));
  const rows: ItemRow[] = [];
  for (const it of items) {
    const hasBom = bomParents.has(it.id);
    rows.push({
      id: it.id, code: it.code, name: it.name, type: it.type, productLine: it.productLine,
      hsn: it.hsn, gstRate: it.gstRate, uom: it.uom, tracking: it.tracking,
      reorderLevel: it.reorderLevel, stdCost: it.stdCost, customerPartNo: it.customerPartNo, specs: it.specs,
      onHand: +(stock.get(it.id) ?? 0).toFixed(3),
      rolledCost: hasBom ? +rolledCostSync(it.id, costMap).toFixed(2) : it.stdCost,
      hasBom,
    });
  }
  return rows;
}

// Synchronous rolled-cost using a preloaded BOM map (avoids N+1).
const _bomCache = new Map<number, { componentItemId: number; qty: number; scrapPct: number }[]>();
let _bomCacheLoaded = false;
async function loadBomCache() {
  if (_bomCacheLoaded) return;
  const lines = await db.bomLine.findMany();
  _bomCache.clear();
  for (const l of lines) {
    const arr = _bomCache.get(l.parentItemId) ?? [];
    arr.push({ componentItemId: l.componentItemId, qty: l.qty, scrapPct: l.scrapPct });
    _bomCache.set(l.parentItemId, arr);
  }
  _bomCacheLoaded = true;
}
function rolledCostSync(itemId: number, itemCost?: Map<number, number>, seen = new Set<number>()): number {
  if (seen.has(itemId)) return 0; // circular guard
  seen.add(itemId);
  const lines = _bomCache.get(itemId);
  if (!lines || !lines.length) return itemCost?.get(itemId) ?? 0;
  return lines.reduce((s, l) => s + l.qty * (1 + l.scrapPct / 100) * rolledCostSync(l.componentItemId, itemCost, seen), 0);
}

export async function rolledCost(itemId: number): Promise<number> {
  await loadBomCache();
  const items = await db.item.findMany({ select: { id: true, stdCost: true } });
  const costMap = new Map(items.map(i => [i.id, i.stdCost]));
  return +rolledCostSync(itemId, costMap).toFixed(2);
}

export async function getItem(id: number) { return db.item.findUnique({ where: { id } }); }

export async function createItem(d: Prisma.ItemUncheckedCreateInput) {
  if (d.code) d.code = String(d.code).toUpperCase();
  return db.item.create({ data: d });
}
export async function updateItem(id: number, d: Prisma.ItemUncheckedUpdateInput) {
  if (d.code && typeof d.code === "string") d.code = d.code.toUpperCase();
  return db.item.update({ where: { id }, data: d });
}

// =====================================================================
//  BOM
// =====================================================================
export async function listBom(parentItemId?: number) {
  return parentItemId == null
    ? db.bomLine.findMany({ orderBy: { id: "asc" } })
    : db.bomLine.findMany({ where: { parentItemId }, orderBy: { id: "asc" } });
}
export async function addBomLine(d: Prisma.BomLineUncheckedCreateInput) {
  await loadBomCache();
  if (d.parentItemId === d.componentItemId) throw new ErpError("An item cannot be its own component");
  if (await isAncestor(d.componentItemId, d.parentItemId)) throw new ErpError("This would create a circular BOM");
  const row = await db.bomLine.create({ data: d });
  _bomCacheLoaded = false; // invalidate
  return row;
}
export async function deleteBomLine(id: number) {
  await db.bomLine.delete({ where: { id } });
  _bomCacheLoaded = false;
}
async function isAncestor(candidate: number, target: number): Promise<boolean> {
  await loadBomCache();
  const lines = _bomCache.get(candidate) ?? [];
  for (const l of lines) {
    if (l.componentItemId === target || (await isAncestor(l.componentItemId, target))) return true;
  }
  return false;
}

// =====================================================================
//  Warehouses & stock ledger
// =====================================================================
export async function listWarehouses() { return db.warehouse.findMany({ orderBy: { code: "asc" } }); }
export async function listTxns(limit = 200) { return db.stockTxn.findMany({ orderBy: { id: "desc" }, take: limit }); }
export async function addTxn(d: Prisma.StockTxnUncheckedCreateInput) { return db.stockTxn.create({ data: d }); }

export async function stockByBatch(): Promise<StockRow[]> {
  const rows = await db.stockTxn.groupBy({
    by: ["itemId", "warehouseId", "batchNo"],
    _sum: { qty: true },
    _min: { id: true },
    having: { qty: { _sum: { gt: 0.0001 } } },
  });
  return rows.map(r => ({ itemId: r.itemId, warehouseId: r.warehouseId, batchNo: r.batchNo, qty: r._sum.qty ?? 0, firstId: r._min.id ?? 0 }));
}

export async function onHandMap(): Promise<Map<number, number>> {
  const blocked = new Set((await db.warehouse.findMany()).filter(w => BLOCKED_WH.includes(w.code)).map(w => w.id));
  const m = new Map<number, number>();
  for (const r of await stockByBatch()) if (!blocked.has(r.warehouseId)) m.set(r.itemId, (m.get(r.itemId) ?? 0) + r.qty);
  return m;
}

export async function transfer(itemId: number, batchNo: string | null, fromWh: number, toWh: number, qty: number, ref: string) {
  const bal = (await stockByBatch()).find(r => r.itemId === itemId && r.warehouseId === fromWh && (r.batchNo ?? null) === (batchNo ?? null));
  if (!bal || bal.qty < qty - 1e-9) throw new ErpError("Insufficient stock in source location for this batch");
  const cost = (await getItem(itemId))?.stdCost ?? 0;
  await db.$transaction([
    db.stockTxn.create({ data: { date: today(), itemId, warehouseId: fromWh, qty: -qty, txnType: "TRANSFER", ref, batchNo, unitCost: cost } }),
    db.stockTxn.create({ data: { date: today(), itemId, warehouseId: toWh, qty, txnType: "TRANSFER", ref, batchNo, unitCost: cost } }),
  ]);
}

// =====================================================================
//  Production orders
// =====================================================================
export async function listOrders() { return db.productionOrder.findMany({ orderBy: { id: "desc" } }); }
export async function getOrder(id: number) { return db.productionOrder.findUnique({ where: { id } }); }

export async function createOrder(d: { itemId: number; qty: number; dueDate: string; warehouseId: number }) {
  if (!(await listBom(d.itemId)).length) throw new ErpError("Item has no BOM — define one before planning production");
  const n = (await db.productionOrder.count()) + 1;
  const orderNo = `PO-${new Date().getFullYear().toString().slice(2)}-${String(n).padStart(4, "0")}`;
  return db.productionOrder.create({ data: { ...d, orderNo } });
}

export async function orderRequirements(orderId: number): Promise<Requirement[]> {
  const order = await getOrder(orderId);
  if (!order) throw new ErpError("Order not found");
  await loadBomCache();
  const stock = await onHandMap();
  const lines = _bomCache.get(order.itemId) ?? [];
  const reqs: Requirement[] = [];
  for (const l of lines) {
    const it = await getItem(l.componentItemId);
    if (!it) continue;
    const required = roundQty(l.qty * (1 + l.scrapPct / 100) * order.qty, it.uom);
    const available = stock.get(it.id) ?? 0;
    reqs.push({ itemId: it.id, code: it.code, name: it.name, uom: it.uom, required, available, shortage: Math.max(0, +(required - available).toFixed(3)) });
  }
  return reqs;
}

export async function startOrder(id: number) {
  const order = await getOrder(id);
  if (!order) throw new ErpError("Order not found");
  if (order.status !== "PLANNED") throw new ErpError("Only planned orders can be started");
  const reqs = await orderRequirements(id);
  const short = reqs.filter(r => r.shortage > 0);
  if (short.length) throw new ErpError(`Material shortage: ${short.map(s => `${s.code} (${s.shortage} ${s.uom})`).join(", ")}`);
  const blocked = new Set((await db.warehouse.findMany()).filter(w => BLOCKED_WH.includes(w.code)).map(w => w.id));
  const consumed: { itemId: number; batchNo: string | null; qty: number }[] = [];
  const batches = (await stockByBatch()).filter(b => !blocked.has(b.warehouseId));
  await db.$transaction(async (tx) => {
    for (const r of reqs) {
      let need = r.required;
      const cost = (await getItem(r.itemId))?.stdCost ?? 0;
      for (const b of batches.filter(b => b.itemId === r.itemId)) {
        if (need <= 1e-9) break;
        const take = Math.min(need, b.qty);
        await tx.stockTxn.create({ data: { date: today(), itemId: r.itemId, warehouseId: b.warehouseId, qty: -take, txnType: "ISSUE", ref: order.orderNo, batchNo: b.batchNo, unitCost: cost } });
        consumed.push({ itemId: r.itemId, batchNo: b.batchNo, qty: +take.toFixed(3) });
        need -= take;
      }
    }
    await tx.productionOrder.update({ where: { id }, data: { status: "IN_PROGRESS", consumedBatches: JSON.stringify(consumed) } });
  });
  return getOrder(id);
}

export async function completeOrder(id: number, goodQty: number, rejectQty: number) {
  const order = await getOrder(id);
  if (!order) throw new ErpError("Order not found");
  if (order.status !== "IN_PROGRESS") throw new ErpError("Only in-progress orders can be completed");
  // If there are WIP units for this order, force closing from the shop floor.
  const wipCount = await db.wipUnit.count({ where: { productionOrderId: id, status: { in: ["QUEUED", "HOLD"] } } });
  if (wipCount > 0) throw new ErpError("This order is on the shop floor — close it from Shop Floor once all units are finished");
  if (goodQty + rejectQty !== order.qty) throw new ErpError(`Good + rejected must equal order quantity (${order.qty})`);
  const item = await getItem(order.itemId);
  if (!item) throw new ErpError("Item not found");
  await db.$transaction(async (tx) => {
    if (goodQty > 0) {
      await tx.stockTxn.create({ data: { date: today(), itemId: item.id, warehouseId: order.warehouseId, qty: goodQty, txnType: "PROD_OUT", ref: order.orderNo, batchNo: order.orderNo, unitCost: await rolledCost(item.id) } });
    }
    if (item.tracking === "serial") await generateSerials(tx, order, item, goodQty, rejectQty);
    await tx.productionOrder.update({ where: { id }, data: { status: "COMPLETED", goodQty, rejectQty } });
  });
  return getOrder(id);
}

async function generateSerials(tx: Prisma.TransactionClient, order: { id: number; itemId: number; orderNo: string }, item: { id: number; productLine: string | null }, good: number, bad: number, date = today()) {
  const ym = date.slice(2, 4) + date.slice(5, 7);
  const prefix = `${PREFIX[item.productLine ?? ""] ?? "FG"}-${ym}-`;
  // find max existing seq across serials table (wip_units share serial_no too)
  const all = await tx.serial.findMany({ where: { serialNo: { startsWith: prefix } }, select: { serialNo: true } });
  const wipAll = await tx.wipUnit.findMany({ where: { serialNo: { startsWith: prefix } }, select: { serialNo: true } });
  const seqs = [...all, ...wipAll].map(s => parseInt(s.serialNo.slice(prefix.length), 10)).filter(n => !isNaN(n));
  let seq = seqs.length ? Math.max(...seqs) : 0;
  const results = [...Array(good).fill("PASS"), ...Array(bad).fill("FAIL")];
  for (const res of results) {
    seq++;
    await tx.serial.create({ data: { serialNo: prefix + String(seq).padStart(5, "0"), itemId: item.id, productionOrderId: order.id, eolResult: res, eolData: JSON.stringify(simulatedEol(item.productLine, res === "PASS")), date, status: res === "PASS" ? "IN_STOCK" : "REJECTED" } });
  }
}

export async function listSerials(limit = 300) { return db.serial.findMany({ orderBy: { id: "desc" }, take: limit }); }

export async function traceSerial(serialNo: string) {
  const s = await db.serial.findUnique({ where: { serialNo: serialNo.trim().toUpperCase() } });
  if (!s) return undefined;
  const order = await getOrder(s.productionOrderId);
  const raw = parse<{ itemId: number; batchNo: string | null; qty: number }[]>(order?.consumedBatches, "[]");
  const comps: { itemId: number; batchNo: string | null; qty: number; item: Awaited<ReturnType<typeof getItem>> }[] = [];
  for (const c of raw) comps.push({ ...c, item: await getItem(c.itemId) });
  const item = await getItem(s.itemId);
  let dispatch: { invNo: string; date: string; customer: string } | null = null;
  if (s.invoiceId) {
    const inv = await db.invoice.findUnique({ where: { id: s.invoiceId }, include: { customer: true } });
    if (inv) dispatch = { invNo: inv.invNo, date: inv.date, customer: inv.customer.name };
  }
  return { serial: s, item, order, components: comps, dispatch };
}

export async function traceBatch(batchNo: string) {
  const orders = await db.productionOrder.findMany();
  const out: { order: typeof orders[number]; item: Awaited<ReturnType<typeof getItem>>; serials: { serialNo: string; eolResult: string; status: string }[] }[] = [];
  for (const o of orders) {
    const consumed = parse<{ batchNo: string | null }[]>(o.consumedBatches, "[]");
    if (consumed.some(c => c.batchNo === batchNo.trim())) {
      const serials = await db.serial.findMany({ where: { productionOrderId: o.id }, select: { serialNo: true, eolResult: true, status: true } });
      out.push({ order: o, item: await getItem(o.itemId), serials });
    }
  }
  return out;
}

// =====================================================================
//  MRP (multi-level, netted against stock)
// =====================================================================
export async function mrp(): Promise<Requirement[]> {
  await loadBomCache();
  const stock = await onHandMap();
  const free = new Map(stock);
  const gross = new Map<number, number>();
  const explode = (itemId: number, qty: number) => {
    const lines = _bomCache.get(itemId) ?? [];
    for (const l of lines) {
      const need = roundQty(l.qty * (1 + l.scrapPct / 100) * qty, "NOS");
      gross.set(l.componentItemId, (gross.get(l.componentItemId) ?? 0) + need);
      const avail = free.get(l.componentItemId) ?? 0;
      const used = Math.min(avail, need);
      free.set(l.componentItemId, avail - used);
      const net = need - used;
      if (net > 0 && (_bomCache.get(l.componentItemId)?.length ?? 0) > 0) explode(l.componentItemId, net);
    }
  };
  const orders = await listOrders();
  for (const o of orders.filter(o => o.status === "PLANNED")) explode(o.itemId, o.qty);
  const items = await db.item.findMany();
  const itemMap = new Map(items.map(i => [i.id, i]));
  return Array.from(gross.entries()).map(([itemId, required]) => {
    const it = itemMap.get(itemId);
    const available = stock.get(itemId) ?? 0;
    return { itemId, code: it?.code ?? "", name: it?.name ?? "", uom: it?.uom ?? "NOS", required: +required.toFixed(3), available: +available.toFixed(3), shortage: Math.max(0, +(required - available).toFixed(3)) };
  }).sort((a, b) => b.shortage - a.shortage);
}

// =====================================================================
//  Dashboard + Summary
// =====================================================================
export async function dashboard(): Promise<Dashboard> {
  const all = await listItems();
  const stock = await onHandMap();
  const stockValue = all.reduce((s, i) => s + (stock.get(i.id) ?? 0) * (i.type === "FG" || i.type === "SFG" ? i.rolledCost : i.stdCost), 0);
  const lowStock = all.filter(i => i.reorderLevel > 0 && (stock.get(i.id) ?? 0) < i.reorderLevel)
    .map(i => ({ id: i.id, code: i.code, name: i.name, uom: i.uom, onHand: stock.get(i.id) ?? 0, reorderLevel: i.reorderLevel }));
  const orders = await listOrders();
  const done = orders.filter(o => o.status === "COMPLETED");
  const good = done.reduce((s, o) => s + o.goodQty, 0);
  const rej = done.reduce((s, o) => s + o.rejectQty, 0);
  const itemMap = new Map(all.map(i => [i.id, i]));
  const byLine: Record<string, { line: string; good: number; reject: number }> = {};
  for (const o of done) {
    const line = itemMap.get(o.itemId)?.productLine ?? "Other";
    byLine[line] ??= { line, good: 0, reject: 0 };
    byLine[line].good += o.goodQty; byLine[line].reject += o.rejectQty;
  }
  return {
    itemCount: all.length, stockValue: Math.round(stockValue), lowStock,
    openOrders: orders.filter(o => o.status !== "COMPLETED").length,
    inProgress: orders.filter(o => o.status === "IN_PROGRESS").length,
    unitsGood: good, unitsRejected: rej, fpy: good + rej ? +(100 * good / (good + rej)).toFixed(1) : null,
    byLine: Object.values(byLine),
  };
}

export async function summary(): Promise<Summary> {
  const sos = await db.salesOrder.findMany({ include: { lines: true } });
  const items = await listItems();
  const itemMap = new Map(items.map(i => [i.id, i]));
  let orderBook = 0, openSOs = 0, overdue = 0;
  const todayStr = today();
  for (const so of sos) {
    if (so.status === "CLOSED") continue;
    openSOs++;
    if (so.deliveryDate < todayStr) overdue++;
    for (const l of so.lines) orderBook += (l.qty - l.dispatchedQty) * l.rate;
  }
  const ym = todayStr.slice(0, 7);
  const invs = await db.invoice.findMany({ where: { status: "ACTIVE" } });
  const salesMtd = invs.filter(i => i.date.startsWith(ym)).reduce((s, i) => s + i.taxable, 0);
  const irnPending = invs.filter(i => !i.irn).length;
  const openIndents = await db.indent.count({ where: { status: "OPEN" } });
  const openPOs = await db.purchaseOrder.count({ where: { status: { in: ["OPEN", "PARTIAL"] } } });
  return { orderBook: Math.round(orderBook), openSOs, overdue, salesMtd: Math.round(salesMtd), irnPending, openIndents, openPOs };
}

// =====================================================================
//  Settings
// =====================================================================
export async function getSettings() { return db.settings.findUnique({ where: { id: 1 } }); }
export async function updateSettings(d: Prisma.SettingsUncheckedUpdateInput) {
  const existing = await getSettings();
  if (existing) return db.settings.update({ where: { id: 1 }, data: d });
  return db.settings.create({ data: { id: 1, legalName: "", gstin: "", stateCode: "27", address: "", city: "", pincode: "", ...d } as Prisma.SettingsUncheckedCreateInput });
}
