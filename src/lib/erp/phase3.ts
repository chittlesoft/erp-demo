// Phase 3 service: MES-lite (shop floor), WMS-lite (bins), Quality (IQC/NCR/PPAP/PDI).
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ErpError, PREFIX, today } from "./shared";

// ---------- Routings ----------
export type Param = { key: string; label: string; unit: string; min?: number; max?: number; kind?: "num" | "bool" };
export type RouteOp = { seq: number; code: string; name: string; station: string; cycleSec: number; params: Param[] };

export async function listRoutings() {
  const ops = await db.routingOp.findMany({ orderBy: { itemId: "asc" }, include: { item: true } });
  return ops;
}
export async function getRouting(itemId: number): Promise<RouteOp[]> {
  const ops = await db.routingOp.findMany({ where: { itemId }, orderBy: { seq: "asc" } });
  return ops.map(o => ({ seq: o.seq, code: o.code, name: o.name, station: o.station, cycleSec: o.cycleSec, params: JSON.parse(o.params) as Param[] }));
}

const DEFAULT_ROUTINGS: Record<string, { code: string; name: string; station: string; cycleSec: number; params: Param[] }[]> = {
  EGTS: [
    { code: "ASM-1", name: "Probe assembly", station: "ASM-1", cycleSec: 90, params: [{ key: "probe_len", label: "Probe length", unit: "mm", min: 68, max: 72 }] },
    { code: "WELD", name: "Crimp / seal + pull test", station: "WELD", cycleSec: 60, params: [{ key: "pull", label: "Pull strength", unit: "N", min: 80 }] },
    { code: "CAL", name: "Calibration & insulation test", station: "CAL", cycleSec: 120, params: [{ key: "acc", label: "Accuracy @600°C", unit: "±°C", min: 0, max: 5 }, { key: "ins", label: "Insulation", unit: "MΩ", min: 100 }] },
    { code: "MARK", name: "Laser marking", station: "MARK", cycleSec: 30, params: [{ key: "mark", label: "Marking OK", unit: "", kind: "bool" }] },
    { code: "PACK", name: "Packing", station: "PACK", cycleSec: 45, params: [{ key: "pack", label: "Packed", unit: "", kind: "bool" }] },
  ],
  NOx: [
    { code: "ASM-2", name: "Sensor assembly", station: "ASM-2", cycleSec: 100, params: [{ key: "asm", label: "Assembly OK", unit: "", kind: "bool" }] },
    { code: "WELD", name: "Seal weld", station: "WELD", cycleSec: 60, params: [{ key: "seal", label: "Seal OK", unit: "", kind: "bool" }] },
    { code: "CAL", name: "EOL test (NOx)", station: "CAL", cycleSec: 150, params: [{ key: "nox", label: "NOx offset", unit: "ppm", min: -10, max: 10 }, { key: "o2", label: "O2 signal", unit: "%", min: 20, max: 22 }] },
    { code: "MARK", name: "Laser marking", station: "MARK", cycleSec: 30, params: [{ key: "mark", label: "Marking OK", unit: "", kind: "bool" }] },
    { code: "PACK", name: "Packing", station: "PACK", cycleSec: 45, params: [{ key: "pack", label: "Packed", unit: "", kind: "bool" }] },
  ],
  Lambda: [
    { code: "ASM-1", name: "Element assembly", station: "ASM-1", cycleSec: 95, params: [{ key: "asm", label: "Assembly OK", unit: "", kind: "bool" }] },
    { code: "CAL", name: "EOL lambda test", station: "CAL", cycleSec: 130, params: [{ key: "lambda", label: "Lambda @ λ=1", unit: "", min: 0.99, max: 1.01 }] },
    { code: "MARK", name: "Laser marking", station: "MARK", cycleSec: 30, params: [{ key: "mark", label: "Marking OK", unit: "", kind: "bool" }] },
    { code: "PACK", name: "Packing", station: "PACK", cycleSec: 45, params: [{ key: "pack", label: "Packed", unit: "", kind: "bool" }] },
  ],
  UQS: [
    { code: "ASM-1", name: "Transducer assembly", station: "ASM-1", cycleSec: 110, params: [{ key: "asm", label: "Assembly OK", unit: "", kind: "bool" }] },
    { code: "CAL", name: "Concentration test", station: "CAL", cycleSec: 140, params: [{ key: "conc", label: "Concentration", unit: "%", min: 31.5, max: 33.5 }] },
    { code: "MARK", name: "Laser marking", station: "MARK", cycleSec: 30, params: [{ key: "mark", label: "Marking OK", unit: "", kind: "bool" }] },
    { code: "PACK", name: "Packing", station: "PACK", cycleSec: 45, params: [{ key: "pack", label: "Packed", unit: "", kind: "bool" }] },
  ],
  DeltaP: [
    { code: "ASM-1", name: "MEMS assembly", station: "ASM-1", cycleSec: 100, params: [{ key: "asm", label: "Assembly OK", unit: "", kind: "bool" }] },
    { code: "CAL", name: "Span / zero test", station: "CAL", cycleSec: 125, params: [{ key: "span", label: "Span error", unit: "% FS", min: 0, max: 2 }] },
    { code: "MARK", name: "Laser marking", station: "MARK", cycleSec: 30, params: [{ key: "mark", label: "Marking OK", unit: "", kind: "bool" }] },
    { code: "PACK", name: "Packing", station: "PACK", cycleSec: 45, params: [{ key: "pack", label: "Packed", unit: "", kind: "bool" }] },
  ],
};

/** Seed default routings for FG items that have none yet. */
export async function ensureRoutings() {
  const fgs = await db.item.findMany({ where: { type: "FG" } });
  for (const fg of fgs) {
    const line = fg.productLine ?? "";
    const def = DEFAULT_ROUTINGS[line] ?? DEFAULT_ROUTINGS.EGTS;
    const existing = await db.routingOp.count({ where: { itemId: fg.id } });
    if (existing) continue;
    for (const o of def) {
      await db.routingOp.create({ data: { itemId: fg.id, seq: def.indexOf(o) * 10 + 10, code: o.code, name: o.name, station: o.station, cycleSec: o.cycleSec, params: JSON.stringify(o.params) } });
    }
  }
}

// ---------- Release to floor (creates WIP units + serials) ----------
export async function releaseOrder(orderId: number) {
  const order = await db.productionOrder.findUnique({ where: { id: orderId }, include: { item: true } });
  if (!order) throw new ErpError("Order not found");
  if (order.status !== "PLANNED") throw new ErpError("Only planned orders can be released to the floor");
  if (order.item.tracking !== "serial") throw new ErpError("Only serial-tracked FG items use the shop floor");
  const ops = await getRouting(order.itemId);
  if (!ops.length) throw new ErpError("No routing defined for this product");
  await ensureRoutings();
  const ops2 = await getRouting(order.itemId);
  await db.$transaction(async (tx) => {
    const ym = today().slice(2, 4) + today().slice(5, 7);
    const prefix = `${PREFIX[order.item.productLine ?? ""] ?? "FG"}-${ym}-`;
    const existing = await tx.serial.findMany({ where: { serialNo: { startsWith: prefix } }, select: { serialNo: true } });
    const wipExisting = await tx.wipUnit.findMany({ where: { serialNo: { startsWith: prefix } }, select: { serialNo: true } });
    let seq = Math.max(0, ...existing.map(s => parseInt(s.serialNo.slice(prefix.length), 10)), ...wipExisting.map(s => parseInt(s.serialNo.slice(prefix.length), 10)));
    for (let i = 0; i < order.qty; i++) {
      seq++;
      const serialNo = prefix + String(seq).padStart(5, "0");
      // create the Serial now too (status in-progress) so trace works
      await tx.serial.create({ data: { serialNo, itemId: order.itemId, productionOrderId: order.id, eolResult: "PASS", eolData: "{}", date: today(), status: "IN_STOCK" } });
      await tx.wipUnit.create({ data: { serialNo, itemId: order.itemId, productionOrderId: order.id, seq: ops2[0].seq, status: "QUEUED", reworkCount: 0, results: "{}" } });
    }
    await tx.productionOrder.update({ where: { id: orderId }, data: { status: "IN_PROGRESS" } });
  });
  return { ok: true, released: order.qty };
}

// ---------- Shop floor board ----------
export async function shopBoard() {
  await ensureRoutings();
  const orders = await db.productionOrder.findMany({ where: { status: "IN_PROGRESS" }, include: { item: true } });
  const wip = await db.wipUnit.findMany({ include: { item: true, order: true } });
  const todayStr = today();

  const stations = new Map<string, { code: string; name: string; queued: number; hold: number; todayDone: number; todayPass: number }>();
  const defects = new Map<string, number>();
  const recent: { serial: string; station: string; operator: string; result: string; reason: string | null; ts: string; op: string }[] = [];

  const logs = await db.opLog.findMany({ orderBy: { id: "desc" }, take: 40, include: { wipUnit: true } });
  for (const log of logs) {
    const s = stations.get(log.station) ?? { code: log.station, name: log.opCode, queued: 0, hold: 0, todayDone: 0, todayPass: 0 };
    if (log.ts.startsWith(todayStr)) { s.todayDone++; if (log.result === "PASS") s.todayPass++; }
    recent.push({ serial: log.wipUnit.serialNo, station: log.station, operator: log.operator, result: log.result, reason: log.reason, ts: log.ts, op: log.opCode });
    if (log.result === "FAIL" && log.reason) defects.set(log.reason, (defects.get(log.reason) ?? 0) + 1);
  }
  for (const u of wip) {
    const ops = await getRouting(u.itemId);
    const cur = ops.find(o => o.seq === u.seq) ?? ops[0];
    if (cur) {
      const s = stations.get(cur.station) ?? { code: cur.station, name: cur.name, queued: 0, hold: 0, todayDone: 0, todayPass: 0 };
      if (u.status === "QUEUED") s.queued++;
      if (u.status === "HOLD") s.hold++;
      stations.set(cur.station, s);
    }
  }

  const orderRows = orders.map(o => {
    const ops = DEFAULT_ROUTINGS[o.item.productLine ?? ""] ?? DEFAULT_ROUTINGS.EGTS;
    return {
      order: { id: o.id, orderNo: o.orderNo, qty: o.qty, dueDate: o.dueDate },
      item: { code: o.item.code, name: o.item.name },
      ops: ops.map(op => {
        const u = wip.filter(x => x.productionOrderId === o.id && x.seq === (ops.indexOf(op) * 10 + 10));
        return { seq: ops.indexOf(op) * 10 + 10, name: op.name, station: op.station, queued: u.filter(x => x.status === "QUEUED").length, hold: u.filter(x => x.status === "HOLD").length };
      }),
      done: wip.filter(x => x.productionOrderId === o.id && x.status === "DONE").length,
      scrap: wip.filter(x => x.productionOrderId === o.id && x.status === "SCRAP").length,
      canClose: wip.filter(x => x.productionOrderId === o.id).every(x => x.status === "DONE" || x.status === "SCRAP"),
    };
  });

  return {
    orders: orderRows,
    stations: Array.from(stations.values()),
    defects: Array.from(defects.entries()).map(([defect, count]) => ({ defect, count })).sort((a, b) => b.count - a.count),
    recent,
  };
}

// ---------- Unit lookup for station terminal ----------
export async function unitInfo(serialNo: string) {
  const unit = await db.wipUnit.findUnique({ where: { serialNo: serialNo.trim().toUpperCase() }, include: { item: true, order: true } });
  if (!unit) return null;
  const ops = await getRouting(unit.itemId);
  const current = ops.find(o => o.seq === unit.seq) ?? null;
  const logs = await db.opLog.findMany({ where: { wipUnitId: unit.id }, orderBy: { id: "asc" } });
  return {
    unit: { id: unit.id, serialNo: unit.serialNo, status: unit.status as "QUEUED" | "HOLD" | "DONE" | "SCRAP", seq: unit.seq, reworkCount: unit.reworkCount, results: JSON.parse(unit.results) },
    item: { id: unit.item.id, code: unit.item.code, name: unit.item.name, customerPartNo: unit.item.customerPartNo },
    order: { id: unit.order.id, orderNo: unit.order.orderNo },
    ops, current,
    logs: logs.map(l => ({ id: l.id, seq: l.seq, opCode: l.opCode, station: l.station, operator: l.operator, result: l.result, data: JSON.parse(l.data), reason: l.reason, ts: l.ts })),
  };
}

function inLimit(p: Param, v: unknown): boolean | null {
  if (p.kind === "bool") return v === true || v === "OK" || v === "true";
  if (v === "" || v === undefined || v === null || isNaN(Number(v))) return null;
  return (p.min === undefined || Number(v) >= p.min) && (p.max === undefined || Number(v) <= p.max);
}

// ---------- Scan / log a unit at a station ----------
export async function scanUnit(d: { serialNo: string; operator: string; values: Record<string, unknown>; reason?: string | null }) {
  const info = await unitInfo(d.serialNo);
  if (!info) throw new ErpError("Serial not found on the shop floor");
  if (info.unit.status === "DONE") throw new ErpError("This unit is already completed");
  if (info.unit.status === "SCRAP") throw new ErpError("This unit was scrapped");
  if (!info.current) throw new ErpError("No current operation");
  // validate values
  let allOk = true;
  for (const p of info.current.params) {
    const v = d.values[p.key];
    if (v === undefined || v === "") throw new ErpError(`Missing value for ${p.label}`);
    const ok = inLimit(p, v);
    if (ok === false) allOk = false;
  }
  const result = allOk ? "PASS" : "FAIL";
  await db.$transaction(async (tx) => {
    await tx.opLog.create({ data: { wipUnitId: info.unit.id, seq: info.unit.seq, opCode: info.current!.code, station: info.current!.station, operator: d.operator, result, data: JSON.stringify(d.values), reason: result === "FAIL" ? (d.reason ?? "Out of spec") : null, ts: new Date().toISOString() } });
    const results = JSON.parse((await tx.wipUnit.findUnique({ where: { id: info.unit.id } }))!.results) as Record<string, unknown>;
    results[String(info.unit.seq)] = { values: d.values, result, ts: new Date().toISOString() };
    if (result === "PASS") {
      const idx = info.ops.findIndex(o => o.seq === info.unit.seq);
      const next = info.ops[idx + 1];
      if (next) await tx.wipUnit.update({ where: { id: info.unit.id }, data: { seq: next.seq, status: "QUEUED", results: JSON.stringify(results) } });
      else await tx.wipUnit.update({ where: { id: info.unit.id }, data: { status: "DONE", results: JSON.stringify(results) } });
    } else {
      await tx.wipUnit.update({ where: { id: info.unit.id }, data: { status: "HOLD", results: JSON.stringify(results) } });
    }
  });
  return { result };
}

// ---------- Disposition: rework / scrap ----------
export async function disposition(d: { serialNo: string; action: "REWORK" | "SCRAP"; reason: string }) {
  const unit = await db.wipUnit.findUnique({ where: { serialNo: d.serialNo.trim().toUpperCase() }, include: { item: true } });
  if (!unit) throw new ErpError("Serial not found");
  if (unit.status !== "HOLD") throw new ErpError("Only units on hold can be reworked or scrapped");
  await db.$transaction(async (tx) => {
    await tx.opLog.create({ data: { wipUnitId: unit.id, seq: unit.seq, opCode: "DISP", station: "DISP", operator: "system", result: d.action === "REWORK" ? "PASS" : "FAIL", data: "{}", reason: d.reason, ts: new Date().toISOString() } });
    if (d.action === "REWORK") {
      await tx.wipUnit.update({ where: { id: unit.id }, data: { status: "QUEUED", reworkCount: { increment: 1 } } });
    } else {
      await tx.wipUnit.update({ where: { id: unit.id }, data: { status: "SCRAP" } });
      await tx.ncr.create({ data: { date: today(), source: "IN_PROCESS", refNo: unit.serialNo, itemId: unit.itemId, batchNo: null, qty: 1, defect: d.reason, disposition: "SCRAP", status: "OPEN" } });
    }
  });
  return { ok: true };
}

// ---------- Close order from shop floor ----------
export async function closeOrderFromFloor(orderId: number) {
  const order = await db.productionOrder.findUnique({ where: { id: orderId }, include: { item: true } });
  if (!order) throw new ErpError("Order not found");
  const wip = await db.wipUnit.findMany({ where: { productionOrderId: orderId } });
  if (!wip.length) throw new ErpError("No WIP units — release the order first");
  if (wip.some(u => u.status === "QUEUED" || u.status === "HOLD")) throw new ErpError("Finish all units first (some are still QUEUED or on HOLD)");
  const done = wip.filter(u => u.status === "DONE").length;
  const scrap = wip.filter(u => u.status === "SCRAP").length;
  await db.$transaction(async (tx) => {
    if (done > 0) await tx.stockTxn.create({ data: { date: today(), itemId: order.itemId, warehouseId: order.warehouseId, qty: done, txnType: "PROD_OUT", ref: order.orderNo, batchNo: order.orderNo, unitCost: 0 } });
    // mark DONE serials as IN_STOCK (already created at release); SCRAP serials → REJECTED
    for (const u of wip) {
      if (u.status === "SCRAP") await tx.serial.update({ where: { serialNo: u.serialNo }, data: { status: "REJECTED", eolResult: "FAIL" } });
    }
    await tx.productionOrder.update({ where: { id: orderId }, data: { status: "COMPLETED", goodQty: done, rejectQty: scrap } });
  });
  return { goodQty: done, rejectQty: scrap };
}

// ---------- Phase 3 summary ----------
export async function phase3Summary() {
  const [wip, hold, ncrs, ppap, bins, qcWh, logs] = await Promise.all([
    db.wipUnit.count({ where: { status: "QUEUED" } }),
    db.wipUnit.count({ where: { status: "HOLD" } }),
    db.ncr.count({ where: { status: "OPEN" } }),
    db.ppap.count({ where: { status: { in: ["PENDING", "SUBMITTED", "INTERIM"] } } }),
    db.bin.count(),
    db.warehouse.findFirst({ where: { code: "QC" } }),
    db.opLog.findMany({ where: { ts: { startsWith: today() } } }),
  ]);
  // pending IQC = stock sitting in QC quarantine
  const qcStock = qcWh ? await db.stockTxn.groupBy({ by: ["itemId"], where: { warehouseId: qcWh.id }, _sum: { qty: true } }) : [];
  const pendingIqc = qcStock.filter(s => (s._sum.qty ?? 0) > 0).length;
  const fpyToday = logs.length ? +(100 * logs.filter(l => l.result === "PASS").length / logs.length).toFixed(1) : null;
  // unbinned: stock lines whose batch isn't in any bin
  const binItems = await db.bin.findMany({ select: { itemId: true, batchNo: true } });
  const binKeys = new Set(binItems.map(b => `${b.itemId}|${b.batchNo ?? ""}`));
  const stock = await db.stockTxn.groupBy({ by: ["itemId", "batchNo"], _sum: { qty: true }, having: { qty: { _sum: { gt: 0.0001 } } } });
  const unbinned = stock.filter(s => (s._sum.qty ?? 0) > 0 && !binKeys.has(`${s.itemId}|${s.batchNo ?? ""}`)).length;
  return { wip, hold, fpyToday, pendingIqc, openNcrs: ncrs, unbinned, ppapPending: ppap };
}

// ---------- Quality: inspections / NCRs / PPAP ----------
export async function listInspections() { return db.inspection.findMany({ orderBy: { id: "desc" } }); }
export async function listNcrs() { return db.ncr.findMany({ orderBy: { id: "desc" } }); }
export async function listPpaps() { return db.ppap.findMany({ orderBy: { id: "desc" }, include: { customer: true } }); }

export async function iqcInspect(d: { grnNo: string; itemId: number; batchNo: string | null; lotQty: number; sampleQty: number; accepted: number; rejected: number; notes?: string }) {
  const item = await db.item.findUnique({ where: { id: d.itemId } });
  const result = d.rejected > 0 && d.accepted === 0 ? "REJECT" : d.accepted > 0 && d.rejected > 0 ? "PARTIAL" : "ACCEPT";
  const qcWh = await db.warehouse.findFirst({ where: { code: "QC" } });
  const rmWh = await db.warehouse.findFirst({ where: { code: "RM" } });
  const rejWh = await db.warehouse.findFirst({ where: { code: "REJ" } });
  await db.$transaction(async (tx) => {
    await tx.inspection.create({ data: { date: today(), refType: "GRN", refNo: d.grnNo, itemId: d.itemId, batchNo: d.batchNo, lotQty: d.lotQty, sampleQty: d.sampleQty, result, acceptedQty: d.accepted, rejectedQty: d.rejected, notes: d.notes ?? null } });
    // move accepted qty QC → RM, rejected qty QC → REJ
    if (d.accepted > 0 && qcWh && rmWh) {
      await tx.stockTxn.create({ data: { date: today(), itemId: d.itemId, warehouseId: qcWh.id, qty: -d.accepted, txnType: "TRANSFER", ref: "IQC", batchNo: d.batchNo, unitCost: item?.stdCost ?? 0 } });
      await tx.stockTxn.create({ data: { date: today(), itemId: d.itemId, warehouseId: rmWh.id, qty: d.accepted, txnType: "TRANSFER", ref: "IQC", batchNo: d.batchNo, unitCost: item?.stdCost ?? 0 } });
    }
    if (d.rejected > 0 && qcWh && rejWh) {
      await tx.stockTxn.create({ data: { date: today(), itemId: d.itemId, warehouseId: qcWh.id, qty: -d.rejected, txnType: "TRANSFER", ref: "IQC", batchNo: d.batchNo, unitCost: item?.stdCost ?? 0 } });
      await tx.stockTxn.create({ data: { date: today(), itemId: d.itemId, warehouseId: rejWh.id, qty: d.rejected, txnType: "TRANSFER", ref: "IQC", batchNo: d.batchNo, unitCost: item?.stdCost ?? 0 } });
      await tx.ncr.create({ data: { date: today(), source: "INCOMING", refNo: d.grnNo, itemId: d.itemId, batchNo: d.batchNo, qty: d.rejected, defect: d.notes ?? "Incoming rejection", disposition: "RETURN", status: "OPEN" } });
    }
  });
  return { result };
}

// ---------- Warehouse bins ----------
export async function listBins() {
  return db.bin.findMany({ orderBy: { code: "asc" }, include: { warehouse: true, item: true } });
}
export async function putAway(d: { itemId: number; batchNo: string | null; qty: number; binCode: string }) {
  const wh = await db.warehouse.findFirst({ where: { code: "RM" } });
  if (!wh) throw new ErpError("RM warehouse missing");
  await db.$transaction(async (tx) => {
    const bin = await tx.bin.upsert({ where: { code: d.binCode }, update: { qty: { increment: d.qty } }, create: { code: d.binCode, warehouseId: wh.id, itemId: d.itemId, batchNo: d.batchNo, qty: d.qty } });
    await tx.binTxn.create({ data: { binId: bin.id, date: today(), qty: d.qty, ref: "PUTAWAY", kind: "IN" } });
  });
  return { ok: true };
}
