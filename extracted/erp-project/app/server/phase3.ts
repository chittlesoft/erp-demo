/**
 * Phase 3 — MES-lite (routing, station scan, test values, rework/scrap),
 * WMS-lite (bins, put-away, FIFO pick lists, cycle count) and Quality
 * (incoming inspection, NCR, PPAP register).
 */
import { db, sqlite, storage, ErpError } from "./storage";
import { phase2 } from "./phase2";
import { serials, productionOrders } from "@shared/schema";
import { eq } from "drizzle-orm";

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const all = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).all(...p) as T[];
const one = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).get(...p) as T | undefined;
const run = (sql: string, ...p: any[]) => sqlite.prepare(sql).run(...p);
const nextNo = (table: string, col: string, prefix: string) =>
  prefix + String(((one<any>(`SELECT COUNT(*) c FROM ${table} WHERE ${col} LIKE ?`, prefix + "%")?.c) ?? 0) + 1).padStart(4, "0");

export type Param = { key: string; label: string; unit: string; min?: number; max?: number; kind?: "num" | "bool" };
export type Op = { seq: number; code: string; name: string; station: string; cycleSec: number; params: Param[] };

export const STATIONS: Record<string, string> = {
  "ASM-1": "Sensor assembly cell",
  "ASM-2": "Electronics fitting & potting",
  "WELD": "Laser welding / crimp & leak test",
  "CAL": "Calibration & EOL test bench",
  "MARK": "Laser marking",
  "PACK": "Final inspection & packing",
};

const P = (key: string, label: string, unit: string, min?: number, max?: number): Param => ({ key, label, unit, min, max, kind: "num" });
const B = (key: string, label: string): Param => ({ key, label, unit: "", kind: "bool" });
const MARK: Omit<Op, "seq"> = { code: "MARK", name: "Laser mark serial + OEM part no.", station: "MARK", cycleSec: 20, params: [B("legible", "2D code readable")] };
const PACK: Omit<Op, "seq"> = { code: "PACK", name: "Final visual inspection & pack", station: "PACK", cycleSec: 45, params: [B("visual", "Visual OK (no damage, cable, connector)")] };
const LEAK = (name = "Laser weld & helium/pressure leak test"): Omit<Op, "seq"> => ({ code: "WELD", name, station: "WELD", cycleSec: 90, params: [P("leak", "Leak (pressure drop)", "Pa", undefined, 50)] });
const PULL: Omit<Op, "seq"> = { code: "WELD", name: "Crimp, seal & cable pull test", station: "WELD", cycleSec: 60, params: [P("pull", "Cable pull force", "N", 80)] };
const seqd = (ops: Omit<Op, "seq">[]): Op[] => ops.map((o, i) => ({ ...o, seq: (i + 1) * 10 }));

/** Routing templates per finished sensor (illustrative limits — replace with control-plan values). */
const ROUTINGS: Record<string, Op[]> = {
  "FG-NOX-BS6": seqd([
    { code: "ASM", name: "Probe & multi-chamber element assembly", station: "ASM-1", cycleSec: 180, params: [] },
    { code: "SCU", name: "Sensor control unit PCB fitting & potting", station: "ASM-2", cycleSec: 150, params: [] },
    LEAK(),
    { code: "EOL", name: "NOx calibration & end-of-line test", station: "CAL", cycleSec: 240, params: [P("nox_off", "NOx offset", "ppm", -10, 10), P("nox_gain", "NOx gain error", "%", -5, 5), P("o2", "O2 reading in air", "%", 20.4, 21.4), P("htr", "Heater current", "A", 0.9, 1.6), B("can", "CAN J1939 communication OK")] },
    MARK, PACK,
  ]),
  "FG-EGTS-TC": seqd([
    { code: "ASM", name: "Thermocouple probe assembly", station: "ASM-1", cycleSec: 90, params: [] },
    PULL,
    { code: "EOL", name: "EGT calibration & insulation test", station: "CAL", cycleSec: 120, params: [P("acc600", "Accuracy @ 600 °C", "°C", -5, 5), P("cjc", "Cold-junction comp. error", "°C", -1, 1), P("ins", "Insulation resistance", "MΩ", 100)] },
    MARK, PACK,
  ]),
  "TTT000002": seqd([
    { code: "ASM", name: "Analogue EGT probe assembly (M14 boss)", station: "ASM-1", cycleSec: 80, params: [] },
    PULL,
    { code: "EOL", name: "EGT accuracy & insulation test", station: "CAL", cycleSec: 90, params: [P("acc600", "Accuracy @ 600 °C", "°C", -5, 5), P("ins", "Insulation resistance", "MΩ", 100)] },
    MARK, PACK,
  ]),
  "TTT000004": seqd([
    { code: "ASM", name: "EGT probe assembly (M12 boss)", station: "ASM-1", cycleSec: 80, params: [] },
    PULL,
    { code: "EOL", name: "EGT accuracy & insulation test", station: "CAL", cycleSec: 90, params: [P("acc600", "Accuracy @ 600 °C", "°C", -5, 5), P("ins", "Insulation resistance", "MΩ", 100)] },
    MARK, PACK,
  ]),
  "FG-EGTS-NTC": seqd([
    { code: "ASM", name: "PTC/NTC probe assembly", station: "ASM-1", cycleSec: 80, params: [] },
    PULL,
    { code: "EOL", name: "Resistance & accuracy test", station: "CAL", cycleSec: 90, params: [P("r25", "Resistance @ 25 °C", "kΩ", 9.5, 10.5), P("acc", "Accuracy @ 300 °C", "°C", -4, 4), P("ins", "Insulation resistance", "MΩ", 100)] },
    MARK, PACK,
  ]),
  "FG-UQS-US": seqd([
    { code: "ASM", name: "Ultrasonic transducer & housing assembly", station: "ASM-1", cycleSec: 150, params: [] },
    { code: "PCB", name: "Controller PCB fitting & potting", station: "ASM-2", cycleSec: 120, params: [] },
    { code: "EOL", name: "Concentration, level & anti-bubble test", station: "CAL", cycleSec: 200, params: [P("conc", "Urea concentration error", "%", -0.7, 0.7), P("lvl", "Level error", "mm", -3, 3), P("temp", "Temperature error", "°C", -2, 2), B("bubble", "Anti-bubble test passed")] },
    MARK, PACK,
  ]),
  "FG-DPS-SENT": seqd([
    { code: "ASM", name: "MEMS die bonding & housing assembly", station: "ASM-1", cycleSec: 100, params: [] },
    { code: "EOL", name: "Pressure calibration & SENT output test", station: "CAL", cycleSec: 110, params: [P("zero", "Zero offset", "kPa", -0.3, 0.3), P("span", "Span error", "% FS", -1.5, 1.5), B("sent", "SENT frame / CRC OK")] },
    MARK, PACK,
  ]),
  "FG-LD6000-D1": seqd([
    { code: "ASM", name: "Planar element + protector D1 assembly", station: "ASM-1", cycleSec: 90, params: [] },
    LEAK(),
    { code: "EOL", name: "Lambda EOL test (heater, rich/lean, response)", station: "CAL", cycleSec: 150, params: [P("htr", "Heater resistance @ RT", "Ω", 2.0, 4.0), P("rich", "Rich output", "mV", 750, 900), P("lean", "Lean output", "mV", 0, 150), P("resp", "Response time", "ms", undefined, 120), P("ins", "Insulation", "MΩ", 10)] },
    MARK, PACK,
  ]),
  "FG-LD6000-D3": seqd([
    { code: "ASM", name: "Planar element + protector D3 assembly", station: "ASM-1", cycleSec: 90, params: [] },
    LEAK(),
    { code: "EOL", name: "Lambda EOL test (heater, rich/lean, response)", station: "CAL", cycleSec: 150, params: [P("htr", "Heater resistance @ RT", "Ω", 2.0, 4.0), P("rich", "Rich output", "mV", 750, 900), P("lean", "Lean output", "mV", 0, 150), P("resp", "Response time", "ms", undefined, 250), P("ins", "Insulation", "MΩ", 10)] },
    MARK, PACK,
  ]),
  "FG-LD6549": seqd([
    { code: "ASM", name: "Wideband element & double-wall tube assembly", station: "ASM-1", cycleSec: 110, params: [] },
    LEAK(),
    { code: "EOL", name: "Wideband EOL test (CJ125 interface)", station: "CAL", cycleSec: 180, params: [P("htr", "Heater resistance @ RT", "Ω", 2.8, 3.6), P("ip", "Pump current in air", "mA", 2.2, 2.9), P("ri", "Nernst cell Ri", "Ω", 250, 350), P("ins", "Insulation", "MΩ", 10)] },
    MARK, PACK,
  ]),
};

const PREFIX: Record<string, string> = { NOx: "NOX", EGTS: "EGT", UQS: "UQS", DeltaP: "DPS", Lambda: "LMB" };
export function nextSerialSeq(prefix: string) {
  const r = one<any>(`SELECT MAX(n) m FROM (SELECT CAST(substr(serial_no, ?) AS INTEGER) n FROM serials WHERE serial_no LIKE ? UNION ALL SELECT CAST(substr(serial_no, ?) AS INTEGER) n FROM wip_units WHERE serial_no LIKE ?)`,
    prefix.length + 1, prefix + "%", prefix.length + 1, prefix + "%");
  return (r?.m ?? 0) as number;
}

/** AQL general inspection level II, single sampling — sample size by lot size */
export function sampleSize(lot: number) {
  const t: [number, number][] = [[8, 2], [15, 3], [25, 5], [50, 8], [90, 13], [150, 20], [280, 32], [500, 50], [1200, 80], [3200, 125], [10000, 200], [35000, 315]];
  for (const [max, n] of t) if (lot <= max) return Math.min(n, lot);
  return 500;
}

export function evaluate(params: Param[], values: Record<string, any>) {
  const failures: string[] = [];
  for (const p of params) {
    const v = values[p.key];
    if (p.kind === "bool") { if (v !== true && v !== "true" && v !== "1" && v !== 1 && v !== "OK" && v !== "ok") failures.push(`${p.label}: not OK`); continue; }
    if (v === undefined || v === null || v === "" || isNaN(+v)) { failures.push(`${p.label}: value missing`); continue; }
    const n = +v;
    if (p.min !== undefined && n < p.min) failures.push(`${p.label}: ${n} ${p.unit} < min ${p.min}`);
    if (p.max !== undefined && n > p.max) failures.push(`${p.label}: ${n} ${p.unit} > max ${p.max}`);
  }
  return failures;
}

/** Random in-spec (or occasionally out-of-spec) bench values — demo only */
export function simulate(params: Param[], failChance = 0.04) {
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

export class Phase3 {
  // ================= MES =================
  routing(itemId: number): Op[] {
    return all(`SELECT * FROM routing_ops WHERE item_id = ? ORDER BY seq`, itemId).map(r => ({ seq: r.seq, code: r.op_code, name: r.op_name, station: r.station, cycleSec: r.cycle_sec, params: JSON.parse(r.params) }));
  }
  routingsAll() {
    return storage.listItems().filter(i => i.type === "FG").map(i => ({ itemId: i.id, code: i.code, name: i.name, ops: this.routing(i.id) }));
  }
  updateParam(itemId: number, seq: number, key: string, min: number | null, max: number | null) {
    const r = one<any>(`SELECT * FROM routing_ops WHERE item_id = ? AND seq = ?`, itemId, seq);
    if (!r) throw new ErpError("Operation not found");
    const params = JSON.parse(r.params) as Param[];
    const p = params.find(p => p.key === key);
    if (!p || p.kind === "bool") throw new ErpError("Parameter not found");
    if (min !== null && max !== null && min > max) throw new ErpError("Min cannot exceed max");
    p.min = min ?? undefined; p.max = max ?? undefined;
    run(`UPDATE routing_ops SET params = ? WHERE id = ?`, JSON.stringify(params), r.id);
    return this.routing(itemId);
  }
  released(orderId: number) { return (one<any>(`SELECT COUNT(*) c FROM wip_units WHERE order_id = ?`, orderId)?.c ?? 0) > 0; }

  releaseOrder(orderId: number) {
    const o = storage.getOrder(orderId);
    if (!o) throw new ErpError("Order not found");
    if (o.status !== "IN_PROGRESS") throw new ErpError("Start the order (issue materials) before releasing it to the shop floor");
    if (this.released(orderId)) throw new ErpError("Order is already on the shop floor");
    const item = storage.getItem(o.itemId)!;
    const ops = this.routing(item.id);
    if (!ops.length) throw new ErpError(`No routing defined for ${item.code}`);
    const d = today();
    const prefix = `${PREFIX[item.productLine ?? ""] ?? "FG"}-${d.slice(2, 4)}${d.slice(5, 7)}-`;
    let seq = nextSerialSeq(prefix);
    const ins = sqlite.prepare(`INSERT INTO wip_units (serial_no, order_id, item_id, seq, status, rework_count, results, created_at, updated_at) VALUES (?,?,?,?, 'QUEUED', 0, '{}', ?, ?)`);
    const out: string[] = [];
    sqlite.transaction(() => { for (let i = 0; i < o.qty; i++) { const s = prefix + String(++seq).padStart(5, "0"); ins.run(s, o.id, item.id, ops[0].seq, now(), now()); out.push(s); } })();
    return { orderNo: o.orderNo, first: out[0], last: out[out.length - 1], count: out.length };
  }

  unit(serial: string) {
    const u = one<any>(`SELECT * FROM wip_units WHERE serial_no = ?`, serial.trim().toUpperCase());
    if (!u) return undefined;
    const item = storage.getItem(u.item_id)!;
    const ops = this.routing(u.item_id);
    const order = storage.getOrder(u.order_id)!;
    const logs = all(`SELECT * FROM op_logs WHERE unit_id = ? ORDER BY id`, u.id).map(l => ({ ...l, data: JSON.parse(l.data) }));
    return { unit: { ...u, results: JSON.parse(u.results) }, item: { id: item.id, code: item.code, name: item.name, customerPartNo: item.customerPartNo }, order: { id: order.id, orderNo: order.orderNo }, ops, current: ops.find(o => o.seq === u.seq) ?? null, logs };
  }

  recordOp(d: { serial: string; station: string; operator: string; values: Record<string, any> }) {
    const info = this.unit(d.serial);
    if (!info) throw new ErpError(`Serial ${d.serial} not found on the shop floor`);
    const { unit: u, current, ops } = info;
    if (u.status === "DONE") throw new ErpError(`${u.serial_no} has completed all operations`);
    if (u.status === "SCRAP") throw new ErpError(`${u.serial_no} was scrapped`);
    if (u.status === "HOLD") throw new ErpError(`${u.serial_no} is on hold after a failed ${current?.name ?? "test"} — record rework or scrap first`);
    if (!current) throw new ErpError("Routing step missing");
    if (current.station !== d.station) throw new ErpError(`${u.serial_no} is waiting at op ${current.seq} ${current.name} (${current.station}) — cannot be processed at ${d.station}. Operations cannot be skipped.`);
    if (!d.operator.trim()) throw new ErpError("Operator name / ID is required");
    const failures = evaluate(current.params, d.values ?? {});
    const result = failures.length ? "FAIL" : "PASS";
    const vals: Record<string, any> = {};
    for (const p of current.params) vals[p.key] = d.values?.[p.key];
    const results = { ...u.results, [current.code]: vals };
    const idx = ops.findIndex(o => o.seq === current.seq);
    const next = ops[idx + 1];
    sqlite.transaction(() => {
      run(`INSERT INTO op_logs (unit_id, serial_no, order_id, seq, op_code, station, operator, result, data, reason, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        u.id, u.serial_no, u.order_id, current.seq, current.code, current.station, d.operator.trim(), result, JSON.stringify(vals), failures.join("; ") || null, now());
      if (result === "PASS") run(`UPDATE wip_units SET seq = ?, status = ?, results = ?, updated_at = ? WHERE id = ?`, next ? next.seq : current.seq, next ? "QUEUED" : "DONE", JSON.stringify(results), now(), u.id);
      else run(`UPDATE wip_units SET status = 'HOLD', results = ?, updated_at = ? WHERE id = ?`, JSON.stringify(results), now(), u.id);
    })();
    return { serial: u.serial_no, result, failures, op: current.name, next: result === "PASS" ? (next ? `${next.seq} ${next.name} (${next.station})` : "Complete — ready for FG") : "On hold — rework or scrap" };
  }

  disposition(d: { serial: string; action: "REWORK" | "SCRAP"; reason: string; operator: string }) {
    const info = this.unit(d.serial);
    if (!info) throw new ErpError("Serial not found");
    const { unit: u, current } = info;
    if (u.status !== "HOLD") throw new ErpError(`${u.serial_no} is not on hold`);
    if (!d.reason.trim()) throw new ErpError("Reason / defect code is required");
    if (d.action === "REWORK" && u.rework_count >= 2) throw new ErpError("Maximum 2 rework attempts reached — unit must be scrapped");
    sqlite.transaction(() => {
      run(`INSERT INTO op_logs (unit_id, serial_no, order_id, seq, op_code, station, operator, result, data, reason, ts) VALUES (?,?,?,?,?,?,?,?, '{}', ?, ?)`,
        u.id, u.serial_no, u.order_id, current!.seq, current!.code, current!.station, d.operator || "—", d.action, d.reason.trim(), now());
      if (d.action === "REWORK") run(`UPDATE wip_units SET status = 'QUEUED', rework_count = rework_count + 1, updated_at = ? WHERE id = ?`, now(), u.id);
      else {
        run(`UPDATE wip_units SET status = 'SCRAP', updated_at = ? WHERE id = ?`, now(), u.id);
        this.createNcr({ source: "IN_PROCESS", ref: `${info.order.orderNo} / op ${current!.seq}`, itemId: u.item_id, batchNo: null, serialNo: u.serial_no, qty: 1, defect: d.reason.trim(), disposition: "SCRAP", status: "CLOSED" });
      }
    })();
    return this.unit(u.serial_no);
  }

  /** CSV: header row "serial,<param keys or labels>…"; one unit per row */
  importCsv(d: { station: string; operator: string; csv: string }) {
    const rows = d.csv.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")).map(l => l.split(/[,;\t]/).map(c => c.trim()));
    if (rows.length < 2) throw new ErpError("CSV needs a header row and at least one data row");
    const header = rows[0].map(h => h.toLowerCase());
    const si = header.findIndex(h => h === "serial" || h === "serial_no" || h === "serialno" || h === "sn");
    if (si < 0) throw new ErpError("Header must contain a 'serial' column");
    const results: { serial: string; result: string; message: string }[] = [];
    for (const r of rows.slice(1)) {
      const serial = (r[si] ?? "").toUpperCase();
      try {
        const info = this.unit(serial);
        if (!info?.current) throw new ErpError(`Serial ${serial} not found on the shop floor`);
        const values: Record<string, any> = {};
        for (const p of info.current.params) {
          const ci = header.findIndex(h => h === p.key.toLowerCase() || h === p.label.toLowerCase() || h.startsWith(p.label.toLowerCase()));
          if (ci >= 0) values[p.key] = p.kind === "bool" ? ["1", "true", "ok", "pass", "y", "yes"].includes((r[ci] ?? "").toLowerCase()) : r[ci];
        }
        const res = this.recordOp({ serial, station: d.station, operator: d.operator, values });
        results.push({ serial, result: res.result, message: res.failures.join("; ") || res.next });
      } catch (e: any) { results.push({ serial, result: "ERROR", message: e.message }); }
    }
    return { processed: results.length, pass: results.filter(r => r.result === "PASS").length, fail: results.filter(r => r.result === "FAIL").length, errors: results.filter(r => r.result === "ERROR").length, results };
  }

  queue(station: string) {
    return all(`SELECT w.serial_no serial, w.status, w.seq, w.rework_count reworks, w.updated_at updatedAt, i.code itemCode, o.order_no orderNo
      FROM wip_units w JOIN items i ON i.id = w.item_id JOIN production_orders o ON o.id = w.order_id JOIN routing_ops r ON r.item_id = w.item_id AND r.seq = w.seq
      WHERE r.station = ? AND w.status IN ('QUEUED','HOLD') ORDER BY CASE w.status WHEN 'HOLD' THEN 0 ELSE 1 END, w.id LIMIT 300`, station);
  }

  board() {
    const orders = all(`SELECT DISTINCT order_id id FROM wip_units`).map(r => storage.getOrder(r.id)!).filter(o => o.status === "IN_PROGRESS");
    const out = orders.map(o => {
      const item = storage.getItem(o.itemId)!;
      const ops = this.routing(item.id);
      const units = all(`SELECT seq, status, COUNT(*) c FROM wip_units WHERE order_id = ? GROUP BY seq, status`, o.id);
      const at = (seq: number, st: string) => units.filter(u => u.seq === seq && u.status === st).reduce((a, u) => a + u.c, 0);
      const done = units.filter(u => u.status === "DONE").reduce((a, u) => a + u.c, 0);
      const scrap = units.filter(u => u.status === "SCRAP").reduce((a, u) => a + u.c, 0);
      const firstFail = one<any>(`SELECT COUNT(DISTINCT unit_id) c FROM op_logs WHERE order_id = ? AND result = 'FAIL'`, o.id)?.c ?? 0;
      const touched = one<any>(`SELECT COUNT(DISTINCT unit_id) c FROM op_logs WHERE order_id = ?`, o.id)?.c ?? 0;
      return { order: { id: o.id, orderNo: o.orderNo, qty: o.qty, dueDate: o.dueDate }, item: { code: item.code, name: item.name }, ops: ops.map(op => ({ seq: op.seq, name: op.name, station: op.station, queued: at(op.seq, "QUEUED"), hold: at(op.seq, "HOLD") })), done, scrap,
        fpy: touched ? Math.round(((touched - firstFail) / touched) * 1000) / 10 : null, canClose: done + scrap === o.qty };
    });
    const stations = Object.entries(STATIONS).map(([code, name]) => {
      const r = one<any>(`SELECT SUM(CASE WHEN w.status='QUEUED' THEN 1 ELSE 0 END) q, SUM(CASE WHEN w.status='HOLD' THEN 1 ELSE 0 END) h FROM wip_units w JOIN routing_ops r ON r.item_id = w.item_id AND r.seq = w.seq WHERE r.station = ?`, code);
      const t = one<any>(`SELECT COUNT(*) c, SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END) p FROM op_logs WHERE station = ? AND substr(ts,1,10) = ? AND result IN ('PASS','FAIL')`, code, today());
      return { code, name, queued: r?.q ?? 0, hold: r?.h ?? 0, todayDone: t?.c ?? 0, todayPass: t?.p ?? 0 };
    });
    const recent = all(`SELECT serial_no serial, station, operator, result, reason, ts, op_code op FROM op_logs ORDER BY id DESC LIMIT 15`);
    return { orders: out, stations, defects: this.topDefects(), recent };
  }
  topDefects() {
    const rows = all<{ reason: string }>(`SELECT reason FROM op_logs WHERE result = 'FAIL' AND reason IS NOT NULL`);
    const m = new Map<string, number>();
    for (const r of rows) for (const f of r.reason.split("; ")) { const k = f.split(":")[0]; m.set(k, (m.get(k) ?? 0) + 1); }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([defect, count]) => ({ defect, count }));
  }

  closeOrder(orderId: number) {
    const o = storage.getOrder(orderId);
    if (!o) throw new ErpError("Order not found");
    if (o.status !== "IN_PROGRESS") throw new ErpError("Order is not in progress");
    const units = all(`SELECT * FROM wip_units WHERE order_id = ?`, orderId);
    if (!units.length) throw new ErpError("Order was not released to the shop floor");
    const open = units.filter(u => u.status !== "DONE" && u.status !== "SCRAP").length;
    if (open) throw new ErpError(`${open} unit(s) still on the shop floor — finish or scrap them first`);
    const item = storage.getItem(o.itemId)!;
    const ops = this.routing(item.id);
    const label = (code: string, key: string) => { const p = ops.find(x => x.code === code)?.params.find(p => p.key === key); return p ? `${p.label}${p.unit ? ` (${p.unit})` : ""}` : key; };
    const good = units.filter(u => u.status === "DONE").length, bad = units.length - good;
    sqlite.transaction(() => {
      for (const u of units) {
        const res = JSON.parse(u.results) as Record<string, Record<string, any>>;
        const eol: Record<string, string> = {};
        for (const [code, vals] of Object.entries(res)) for (const [k, v] of Object.entries(vals ?? {})) if (ops.find(x => x.code === code)?.params.length) eol[label(code, k)] = v === true ? "OK" : String(v);
        db.insert(serials).values({ serialNo: u.serial_no, itemId: item.id, productionOrderId: o.id, eolResult: u.status === "DONE" ? "PASS" : "FAIL", eolData: JSON.stringify(eol), date: today(), status: u.status === "DONE" ? "IN_STOCK" : "REJECTED" }).run();
      }
      if (good) storage.addTxn({ date: today(), itemId: item.id, warehouseId: o.warehouseId, qty: good, txnType: "PROD_OUT", ref: o.orderNo, batchNo: o.orderNo, unitCost: storage.rolledCost(item.id) });
      db.update(productionOrders).set({ status: "COMPLETED", goodQty: good, rejectQty: bad }).where(eq(productionOrders.id, o.id)).run();
    })();
    return { orderNo: o.orderNo, good, rejected: bad };
  }
  unitHistory(serial: string) {
    const u = one<any>(`SELECT id FROM wip_units WHERE serial_no = ?`, serial.trim().toUpperCase());
    return u ? all(`SELECT seq, op_code op, station, operator, result, data, reason, ts FROM op_logs WHERE unit_id = ? ORDER BY id`, u.id).map(l => ({ ...l, data: JSON.parse(l.data) })) : [];
  }

  // ================= WMS =================
  whId(code: string) { return storage.listWarehouses().find(w => w.code === code)!.id; }
  listBins() { return all(`SELECT b.*, w.code whCode FROM bins b JOIN warehouses w ON w.id = b.warehouse_id ORDER BY b.code`); }
  createBin(d: { code: string; warehouseId: number; zone: string }) {
    if (!/^[A-Z0-9-]{3,20}$/.test(d.code)) throw new ErpError("Bin code: 3–20 chars, A–Z, 0–9 and -");
    run(`INSERT INTO bins (code, warehouse_id, zone) VALUES (?,?,?)`, d.code, d.warehouseId, d.zone || "");
    return this.listBins();
  }
  /** Keep bin quantities ≤ ledger stock (issues, dispatches and adjustments flow through automatically). */
  reconcile() {
    const stock = new Map<string, number>();
    for (const r of storage.stockByBatch()) stock.set(`${r.itemId}|${r.warehouseId}|${r.batchNo ?? ""}`, r.qty);
    const binned = all(`SELECT item_id, warehouse_id, IFNULL(batch_no,'') batch, bin_id, SUM(qty) q, MIN(id) f FROM bin_txns GROUP BY item_id, warehouse_id, batch, bin_id HAVING SUM(qty) > 0.0001 ORDER BY f`);
    const groups = new Map<string, any[]>();
    for (const b of binned) { const k = `${b.item_id}|${b.warehouse_id}|${b.batch}`; groups.set(k, [...(groups.get(k) ?? []), b]); }
    const ins = sqlite.prepare(`INSERT INTO bin_txns (ts, item_id, warehouse_id, batch_no, bin_id, qty, ref) VALUES (?,?,?,?,?,?, 'AUTO-ISSUE')`);
    sqlite.transaction(() => {
      for (const [k, rows] of Array.from(groups.entries())) {
        let excess = rows.reduce((a: number, r: any) => a + r.q, 0) - (stock.get(k) ?? 0);
        for (const r of rows) { if (excess <= 1e-6) break; const t = Math.min(excess, r.q); ins.run(now(), r.item_id, r.warehouse_id, r.batch || null, r.bin_id, -t); excess -= t; }
      }
    })();
  }
  binStock() {
    this.reconcile();
    return all(`SELECT t.bin_id binId, b.code bin, t.item_id itemId, i.code itemCode, i.name itemName, i.uom, t.warehouse_id warehouseId, t.batch_no batchNo, SUM(t.qty) qty, i.std_cost cost
      FROM bin_txns t JOIN bins b ON b.id = t.bin_id JOIN items i ON i.id = t.item_id GROUP BY t.bin_id, t.item_id, t.batch_no HAVING SUM(t.qty) > 0.0001 ORDER BY b.code, i.code`);
  }
  unbinned() {
    this.reconcile();
    const skip = new Set([this.whId("WIP"), this.whId("QC"), ...storage.listWarehouses().filter(w => w.code === "JW").map(w => w.id)]); // QC lots are handled by incoming inspection
    const binned = new Map<string, number>();
    for (const r of all(`SELECT item_id, warehouse_id, IFNULL(batch_no,'') b, SUM(qty) q FROM bin_txns GROUP BY item_id, warehouse_id, b`)) binned.set(`${r.item_id}|${r.warehouse_id}|${r.b}`, r.q);
    return storage.stockByBatch().filter(r => !skip.has(r.warehouseId)).map(r => {
      const it = storage.getItem(r.itemId)!;
      return { itemId: r.itemId, itemCode: it.code, itemName: it.name, uom: it.uom, warehouseId: r.warehouseId, batchNo: r.batchNo, qty: +(r.qty - (binned.get(`${r.itemId}|${r.warehouseId}|${r.batchNo ?? ""}`) ?? 0)).toFixed(3) };
    }).filter(r => r.qty > 0.0001);
  }
  putaway(d: { itemId: number; warehouseId: number; batchNo: string | null; binId: number; qty: number; ref?: string }) {
    const bin = one<any>(`SELECT * FROM bins WHERE id = ?`, d.binId);
    if (!bin) throw new ErpError("Bin not found");
    if (bin.warehouse_id !== d.warehouseId) throw new ErpError(`Bin ${bin.code} belongs to a different store`);
    const free = this.unbinned().find(r => r.itemId === d.itemId && r.warehouseId === d.warehouseId && (r.batchNo ?? null) === (d.batchNo ?? null))?.qty ?? 0;
    if (d.qty <= 0 || d.qty > free + 1e-9) throw new ErpError(`Only ${free} available to put away for this batch`);
    run(`INSERT INTO bin_txns (ts, item_id, warehouse_id, batch_no, bin_id, qty, ref) VALUES (?,?,?,?,?,?,?)`, now(), d.itemId, d.warehouseId, d.batchNo, d.binId, d.qty, d.ref ?? "PUTAWAY");
    return { ok: true, bin: bin.code };
  }
  moveBin(d: { itemId: number; batchNo: string | null; fromBinId: number; toBinId: number; qty: number }) {
    const from = one<any>(`SELECT * FROM bins WHERE id = ?`, d.fromBinId), to = one<any>(`SELECT * FROM bins WHERE id = ?`, d.toBinId);
    if (!from || !to) throw new ErpError("Bin not found");
    if (from.warehouse_id !== to.warehouse_id) throw new ErpError("Bin-to-bin moves must stay within the same store");
    const have = this.binStock().find(r => r.binId === from.id && r.itemId === d.itemId && (r.batchNo ?? null) === (d.batchNo ?? null))?.qty ?? 0;
    if (d.qty <= 0 || d.qty > have + 1e-9) throw new ErpError(`Only ${have} in ${from.code}`);
    sqlite.transaction(() => {
      run(`INSERT INTO bin_txns (ts, item_id, warehouse_id, batch_no, bin_id, qty, ref) VALUES (?,?,?,?,?,?, 'MOVE')`, now(), d.itemId, from.warehouse_id, d.batchNo, from.id, -d.qty);
      run(`INSERT INTO bin_txns (ts, item_id, warehouse_id, batch_no, bin_id, qty, ref) VALUES (?,?,?,?,?,?, 'MOVE')`, now(), d.itemId, to.warehouse_id, d.batchNo, to.id, d.qty);
    })();
    return { ok: true };
  }
  /** FIFO pick (same batch order the system uses when it issues/dispatches), split by bin. */
  private fifoPick(itemId: number, need: number, whIds: number[]) {
    const bins = this.binStock();
    const lines: { batchNo: string | null; bin: string; qty: number }[] = [];
    for (const b of storage.stockByBatch().filter(r => r.itemId === itemId && whIds.includes(r.warehouseId))) {
      if (need <= 1e-9) break;
      let take = Math.min(need, b.qty); need -= take;
      for (const bs of bins.filter(x => x.itemId === itemId && x.warehouseId === b.warehouseId && (x.batchNo ?? null) === (b.batchNo ?? null))) {
        if (take <= 1e-9) break;
        const t = Math.min(take, bs.qty); lines.push({ batchNo: b.batchNo, bin: bs.bin, qty: +t.toFixed(3) }); take -= t;
      }
      if (take > 1e-9) lines.push({ batchNo: b.batchNo, bin: "Not put away", qty: +take.toFixed(3) });
    }
    return { lines, short: +Math.max(0, need).toFixed(3) };
  }
  pickForOrder(orderId: number) {
    const o = storage.getOrder(orderId);
    if (!o) throw new ErpError("Order not found");
    if (o.status !== "PLANNED") throw new ErpError("Pick lists are for planned orders (materials not yet issued)");
    const whs = storage.listWarehouses().filter(w => !["QC", "REJ", "JW"].includes(w.code)).map(w => w.id);
    return { ref: o.orderNo, title: `Production issue — ${storage.getItem(o.itemId)!.code} × ${o.qty}`,
      rows: storage.orderRequirements(o).map(r => ({ itemCode: r.code, itemName: r.name, uom: r.uom, required: r.required, ...this.fifoPick(r.itemId, r.required, whs) })) };
  }
  pickForSo(soId: number) {
    const so = phase2.listSOs().find(s => s.id === soId);
    if (!so) throw new ErpError("Sales order not found");
    const fg = [this.whId("FG")];
    return { ref: so.soNo, title: `Dispatch — ${phase2.getParty(so.customerId)?.name ?? ""}`,
      rows: so.lines.filter(l => l.qty > l.dispatchedQty).map(l => { const it = storage.getItem(l.itemId)!; const need = l.qty - l.dispatchedQty; return { itemCode: it.code, itemName: it.name, uom: it.uom, required: need, ...this.fifoPick(l.itemId, need, fg) }; }) };
  }
  cycleCount(d: { binId: number; countedBy: string; lines: { itemId: number; batchNo: string | null; counted: number }[] }) {
    const bin = one<any>(`SELECT * FROM bins WHERE id = ?`, d.binId);
    if (!bin) throw new ErpError("Bin not found");
    if (!d.countedBy.trim()) throw new ErpError("Counted by is required");
    const sys = this.binStock().filter(r => r.binId === bin.id);
    const ccNo = nextNo("cycle_counts", "cc_no", `CC/${today().slice(2, 4)}${today().slice(5, 7)}/`);
    const out: any[] = []; let value = 0;
    sqlite.transaction(() => {
      for (const l of d.lines) {
        if (l.counted < 0) throw new ErpError("Counted quantity cannot be negative");
        const s = sys.find(r => r.itemId === l.itemId && (r.batchNo ?? null) === (l.batchNo ?? null));
        const system = s?.qty ?? 0, variance = +(l.counted - system).toFixed(3);
        const it = storage.getItem(l.itemId)!;
        out.push({ itemCode: it.code, batchNo: l.batchNo, system, counted: l.counted, variance });
        if (Math.abs(variance) > 1e-9) {
          value += variance * (it.stdCost || storage.rolledCost(it.id));
          storage.addTxn({ date: today(), itemId: it.id, warehouseId: bin.warehouse_id, qty: variance, txnType: "ADJUST", ref: ccNo, batchNo: l.batchNo, unitCost: it.stdCost });
          run(`INSERT INTO bin_txns (ts, item_id, warehouse_id, batch_no, bin_id, qty, ref) VALUES (?,?,?,?,?,?,?)`, now(), it.id, bin.warehouse_id, l.batchNo, bin.id, variance, ccNo);
        }
      }
      run(`INSERT INTO cycle_counts (cc_no, bin_id, date, lines, counted_by, variance_value) VALUES (?,?,?,?,?,?)`, ccNo, bin.id, today(), JSON.stringify(out), d.countedBy.trim(), Math.round(value * 100) / 100);
    })();
    return { ccNo, bin: bin.code, lines: out, varianceValue: Math.round(value) };
  }
  listCycleCounts() { return all(`SELECT c.*, b.code bin FROM cycle_counts c JOIN bins b ON b.id = c.bin_id ORDER BY c.id DESC LIMIT 50`).map(c => ({ ...c, lines: JSON.parse(c.lines) })); }

  // ================= Quality =================
  pendingInspection() {
    const qc = this.whId("QC");
    return storage.stockByBatch().filter(r => r.warehouseId === qc).map(r => {
      const it = storage.getItem(r.itemId)!;
      const t = one<any>(`SELECT ref, date FROM stock_txns WHERE item_id = ? AND warehouse_id = ? AND IFNULL(batch_no,'') = ? AND qty > 0 ORDER BY id DESC LIMIT 1`, r.itemId, qc, r.batchNo ?? "");
      return { itemId: r.itemId, itemCode: it.code, itemName: it.name, uom: it.uom, batchNo: r.batchNo, qty: r.qty, ref: t?.ref ?? "", receivedOn: t?.date ?? "", sample: sampleSize(Math.round(r.qty)) };
    });
  }
  inspect(d: { itemId: number; batchNo: string | null; accepted: number; rejected: number; inspector: string; checks: Record<string, boolean>; defect?: string }) {
    const lot = this.pendingInspection().find(p => p.itemId === d.itemId && (p.batchNo ?? null) === (d.batchNo ?? null));
    if (!lot) throw new ErpError("Batch is not in QC quarantine");
    if (!d.inspector.trim()) throw new ErpError("Inspector name is required");
    if (d.accepted < 0 || d.rejected < 0 || Math.abs(d.accepted + d.rejected - lot.qty) > 1e-6) throw new ErpError(`Accepted + rejected must equal lot quantity (${lot.qty})`);
    if (d.rejected > 0 && !d.defect?.trim()) throw new ErpError("Describe the defect for rejected quantity");
    const failedChecks = Object.entries(d.checks).filter(([, v]) => !v).map(([k]) => k);
    if (d.accepted > 0 && d.rejected === 0 && failedChecks.length) throw new ErpError(`Checks not OK (${failedChecks.join(", ")}) — reject or partially reject the lot`);
    const qc = this.whId("QC"), rm = this.whId("RM"), rej = this.whId("REJ");
    const no = nextNo("inspections", "insp_no", `IQC/${today().slice(2, 4)}${today().slice(5, 7)}/`);
    let ncrNo: string | null = null;
    sqlite.transaction(() => {
      if (d.accepted > 0) storage.transfer(d.itemId, d.batchNo, qc, rm, d.accepted, no);
      if (d.rejected > 0) {
        storage.transfer(d.itemId, d.batchNo, qc, rej, d.rejected, no);
        ncrNo = this.createNcr({ source: "INCOMING", ref: `${lot.ref} / ${no}`, itemId: d.itemId, batchNo: d.batchNo, serialNo: null, qty: d.rejected, defect: d.defect!.trim(), disposition: "PENDING", status: "OPEN" });
      }
      run(`INSERT INTO inspections (insp_no, date, item_id, batch_no, ref, qty, sample, checks, accepted, rejected, result, inspector) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        no, today(), d.itemId, d.batchNo, lot.ref, lot.qty, lot.sample, JSON.stringify(d.checks), d.accepted, d.rejected, d.rejected === 0 ? "ACCEPTED" : d.accepted === 0 ? "REJECTED" : "PARTIAL", d.inspector.trim());
    })();
    return { inspNo: no, ncrNo };
  }
  listInspections() { return all(`SELECT s.*, i.code itemCode FROM inspections s JOIN items i ON i.id = s.item_id ORDER BY s.id DESC LIMIT 100`).map(r => ({ ...r, checks: JSON.parse(r.checks) })); }
  createNcr(d: { source: string; ref: string; itemId: number; batchNo: string | null; serialNo: string | null; qty: number; defect: string; disposition: string; status: string }) {
    const no = nextNo("ncrs", "ncr_no", `NCR/${today().slice(2, 4)}${today().slice(5, 7)}/`);
    run(`INSERT INTO ncrs (ncr_no, date, source, ref, item_id, batch_no, serial_no, qty, defect, disposition, status, closed_on, remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
      no, today(), d.source, d.ref, d.itemId, d.batchNo, d.serialNo, d.qty, d.defect, d.disposition, d.status, d.status === "CLOSED" ? today() : null);
    return no;
  }
  listNcrs() { return all(`SELECT n.*, i.code itemCode, i.name itemName FROM ncrs n JOIN items i ON i.id = n.item_id ORDER BY n.status DESC, n.id DESC LIMIT 200`); }
  closeNcr(id: number, d: { disposition: "RTV" | "SCRAP" | "UAI"; remarks: string }) {
    const n = one<any>(`SELECT * FROM ncrs WHERE id = ?`, id);
    if (!n) throw new ErpError("NCR not found");
    if (n.status === "CLOSED") throw new ErpError("NCR already closed");
    if (!d.remarks.trim()) throw new ErpError("Remarks are required (e.g. debit note no., deviation approval)");
    const rej = this.whId("REJ"), rm = this.whId("RM");
    sqlite.transaction(() => {
      if (n.source === "INCOMING") {
        if (d.disposition === "UAI") storage.transfer(n.item_id, n.batch_no, rej, rm, n.qty, n.ncr_no);
        else storage.addTxn({ date: today(), itemId: n.item_id, warehouseId: rej, qty: -n.qty, txnType: d.disposition === "RTV" ? "RTV" : "SCRAP", ref: n.ncr_no, batchNo: n.batch_no, unitCost: storage.getItem(n.item_id)?.stdCost ?? 0 });
      }
      run(`UPDATE ncrs SET disposition = ?, status = 'CLOSED', closed_on = ?, remarks = ? WHERE id = ?`, d.disposition, today(), d.remarks.trim(), id);
    })();
    return one(`SELECT * FROM ncrs WHERE id = ?`, id);
  }
  listPpap() { return all(`SELECT p.*, i.code itemCode, i.name itemName, i.customer_part_no customerPartNo, c.name customer FROM ppap p JOIN items i ON i.id = p.item_id JOIN parties c ON c.id = p.customer_id ORDER BY c.name, i.code`); }
  upsertPpap(d: { id?: number; itemId: number; customerId: number; level: number; status: string; submittedOn: string | null; approvedOn: string | null; remarks: string }) {
    if (d.status === "APPROVED" && !d.approvedOn) throw new ErpError("PSW approval date is required for APPROVED");
    if (d.id) run(`UPDATE ppap SET level=?, status=?, submitted_on=?, approved_on=?, remarks=? WHERE id=?`, d.level, d.status, d.submittedOn, d.approvedOn, d.remarks, d.id);
    else {
      if (one(`SELECT id FROM ppap WHERE item_id=? AND customer_id=?`, d.itemId, d.customerId)) throw new ErpError("PPAP record already exists for this part and customer");
      run(`INSERT INTO ppap (item_id, customer_id, level, status, submitted_on, approved_on, remarks) VALUES (?,?,?,?,?,?,?)`, d.itemId, d.customerId, d.level, d.status, d.submittedOn, d.approvedOn, d.remarks);
    }
    return this.listPpap();
  }

  // ---- PPAP gate on dispatch ----
  ppapCheck(customerId: number, itemIds: number[]) {
    return Array.from(new Set(itemIds)).map(id => {
      const r = one<any>(`SELECT status, remarks FROM ppap WHERE item_id = ? AND customer_id = ?`, id, customerId);
      const status: string | null = r?.status ?? null;
      return { itemId: id, itemCode: storage.getItem(id)?.code ?? "", status, ok: status === null || status === "APPROVED" || status === "INTERIM", remarks: r?.remarks ?? "" };
    });
  }
  assertPpap(soId: number, lines: { soLineId: number; qty: number }[]) {
    const so = phase2.listSOs().find(s => s.id === soId);
    if (!so) return;
    const ids = lines.filter(l => l.qty > 0).map(l => so.lines.find(x => x.id === l.soLineId)?.itemId).filter((x): x is number => !!x);
    const bad = this.ppapCheck(so.customerId, ids).filter(r => !r.ok);
    if (bad.length) throw new ErpError(`Dispatch blocked: PPAP not approved for ${bad.map(b => `${b.itemCode} (${b.status})`).join(", ")} with ${phase2.getParty(so.customerId)?.name}. Record PSW or interim approval in Quality → PPAP register first.`);
  }

  // ---- Labels ----
  orderSerials(orderId: number) {
    const o = storage.getOrder(orderId);
    if (!o) throw new ErpError("Order not found");
    const it = storage.getItem(o.itemId)!;
    const rows = all<{ serial: string; status: string }>(`SELECT serial_no serial, status FROM wip_units WHERE order_id = ? AND status != 'SCRAP'
      UNION SELECT serial_no serial, status FROM serials WHERE production_order_id = ? AND serial_no NOT IN (SELECT serial_no FROM wip_units WHERE order_id = ?) ORDER BY serial`, orderId, orderId, orderId);
    return { orderNo: o.orderNo, itemCode: it.code, itemName: it.name, customerPartNo: (it as any).customerPartNo ?? null, date: today(), serials: rows };
  }

  // ---- CSV template for bench import ----
  csvTemplate(station: string) {
    const q = this.queue(station).filter(r => r.status === "QUEUED");
    if (!q.length) throw new ErpError(`No units waiting at ${station}`);
    const itemCode = q[0].itemCode;
    const r = this.routingsAll().find(x => x.code === itemCode)!;
    const op = r.ops.find(o => o.station === station)!;
    const lines = [["serial", ...op.params.map(p => p.key)].join(",")];
    for (const u of q.filter(u => u.itemCode === itemCode).slice(0, 200)) lines.push([u.serial, ...op.params.map(() => "")].join(","));
    const legend = op.params.map(p => `# ${p.key} = ${p.label}${p.unit ? ` (${p.unit})` : ""}${p.kind === "bool" ? " — 1/0, OK/NG" : ""}`);
    return { filename: `${station}-${itemCode}-results.csv`, body: [`# ${itemCode} op ${op.seq} ${op.name}`, ...legend, ...lines].join("\n") + "\n" };
  }

  summary() {
    const w = one<any>(`SELECT SUM(CASE WHEN status='QUEUED' THEN 1 ELSE 0 END) q, SUM(CASE WHEN status='HOLD' THEN 1 ELSE 0 END) h FROM wip_units`);
    const t = one<any>(`SELECT COUNT(DISTINCT unit_id) n, COUNT(DISTINCT CASE WHEN result='FAIL' THEN unit_id END) f FROM op_logs WHERE substr(ts,1,10) = ?`, today());
    return { wip: w?.q ?? 0, hold: w?.h ?? 0, fpyToday: t?.n ? Math.round(((t.n - t.f) / t.n) * 1000) / 10 : null,
      pendingIqc: this.pendingInspection().length, openNcrs: one<any>(`SELECT COUNT(*) c FROM ncrs WHERE status='OPEN'`)?.c ?? 0, unbinned: this.unbinned().length,
      ppapPending: one<any>(`SELECT COUNT(*) c FROM ppap WHERE status != 'APPROVED'`)?.c ?? 0 };
  }

  // ================= Seed =================
  seed() {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS routing_ops (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, seq INTEGER NOT NULL, op_code TEXT NOT NULL, op_name TEXT NOT NULL, station TEXT NOT NULL, cycle_sec INTEGER NOT NULL DEFAULT 60, params TEXT NOT NULL DEFAULT '[]', UNIQUE(item_id, seq));
      CREATE TABLE IF NOT EXISTS wip_units (id INTEGER PRIMARY KEY AUTOINCREMENT, serial_no TEXT NOT NULL UNIQUE, order_id INTEGER NOT NULL, item_id INTEGER NOT NULL, seq INTEGER NOT NULL, status TEXT NOT NULL, rework_count INTEGER NOT NULL DEFAULT 0, results TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS op_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, unit_id INTEGER NOT NULL, serial_no TEXT NOT NULL, order_id INTEGER NOT NULL, seq INTEGER NOT NULL, op_code TEXT NOT NULL, station TEXT NOT NULL, operator TEXT NOT NULL, result TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', reason TEXT, ts TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bins (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, warehouse_id INTEGER NOT NULL, zone TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS bin_txns (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, item_id INTEGER NOT NULL, warehouse_id INTEGER NOT NULL, batch_no TEXT, bin_id INTEGER NOT NULL, qty REAL NOT NULL, ref TEXT);
      CREATE TABLE IF NOT EXISTS cycle_counts (id INTEGER PRIMARY KEY AUTOINCREMENT, cc_no TEXT NOT NULL UNIQUE, bin_id INTEGER NOT NULL, date TEXT NOT NULL, lines TEXT NOT NULL, counted_by TEXT NOT NULL, variance_value REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, insp_no TEXT NOT NULL UNIQUE, date TEXT NOT NULL, item_id INTEGER NOT NULL, batch_no TEXT, ref TEXT, qty REAL NOT NULL, sample INTEGER NOT NULL, checks TEXT NOT NULL, accepted REAL NOT NULL, rejected REAL NOT NULL, result TEXT NOT NULL, inspector TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ncrs (id INTEGER PRIMARY KEY AUTOINCREMENT, ncr_no TEXT NOT NULL UNIQUE, date TEXT NOT NULL, source TEXT NOT NULL, ref TEXT, item_id INTEGER NOT NULL, batch_no TEXT, serial_no TEXT, qty REAL NOT NULL, defect TEXT NOT NULL, disposition TEXT NOT NULL, status TEXT NOT NULL, closed_on TEXT, remarks TEXT);
      CREATE TABLE IF NOT EXISTS ppap (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, level INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL, submitted_on TEXT, approved_on TEXT, remarks TEXT NOT NULL DEFAULT '', UNIQUE(item_id, customer_id));
    `);
    if (!storage.listWarehouses().find(w => w.code === "REJ")) run(`INSERT INTO warehouses (code, name) VALUES ('REJ', 'Rejected / Return to vendor')`);
    if ((one<any>(`SELECT COUNT(*) c FROM routing_ops`)?.c ?? 0) > 0) return;

    // Routings
    const insOp = sqlite.prepare(`INSERT INTO routing_ops (item_id, seq, op_code, op_name, station, cycle_sec, params) VALUES (?,?,?,?,?,?,?)`);
    const byCode = new Map(storage.listItems().map(i => [i.code, i]));
    for (const [code, ops] of Object.entries(ROUTINGS)) { const it = byCode.get(code); if (it) for (const o of ops) insOp.run(it.id, o.seq, o.code, o.name, o.station, o.cycleSec, JSON.stringify(o.params)); }

    // Bins: RM racks A–C × shelves 1–3 × 2 bins; FG 8 bays; QC hold; REJ cage
    const W = Object.fromEntries(storage.listWarehouses().map(w => [w.code, w.id]));
    const insBin = sqlite.prepare(`INSERT INTO bins (code, warehouse_id, zone) VALUES (?,?,?)`);
    for (const r of ["A", "B", "C"]) for (let s = 1; s <= 3; s++) for (let b = 1; b <= 2; b++) insBin.run(`RM-${r}${s}-${b}`, W.RM, r === "A" ? "Sensing elements & electronics (ESD)" : r === "B" ? "Housings & mechanical" : "Cables, connectors & consumables");
    for (let b = 1; b <= 8; b++) insBin.run(`FG-${String(b).padStart(2, "0")}`, W.FG, "Packed finished sensors");
    insBin.run("QC-HOLD-1", W.QC, "Quarantine"); insBin.run("QC-HOLD-2", W.QC, "Quarantine"); insBin.run("REJ-01", W.REJ, "Locked reject cage");
    const bins = this.listBins();
    const rmBins = bins.filter(b => b.warehouse_id === W.RM), fgBins = bins.filter(b => b.warehouse_id === W.FG);
    const zoneFor = (code: string) => /ZR|TC|NTC|PZ|US|PCB/.test(code) ? "A" : /HSG|PROT|PTUBE/.test(code) ? "B" : "C";
    const counters: Record<string, number> = { A: 0, B: 0, C: 0 };
    let fgi = 0, skip = 0;
    for (const r of this.unbinned()) {
      const it = storage.getItem(r.itemId)!;
      if (r.warehouseId === W.RM) {
        if (it.code === "RM-CON-6P" || it.code === "RM-PROT-D3") { skip++; continue; } // left for the put-away demo
        const z = zoneFor(it.code); const zb = rmBins.filter(b => b.code.startsWith(`RM-${z}`));
        this.putaway({ ...r, binId: zb[counters[z]++ % zb.length].id, ref: "OPENING" });
      } else if (r.warehouseId === W.FG) this.putaway({ ...r, binId: fgBins[fgi++ % fgBins.length].id, ref: "OPENING" });
    }

    // MES: release the in-progress EGTS order and push units through stations
    const ord = storage.listOrders().find(o => o.status === "IN_PROGRESS" && storage.getItem(o.itemId)?.code === "FG-EGTS-TC");
    if (ord) {
      const rel = this.releaseOrder(ord.id);
      const ops = this.routing(ord.itemId);
      const ppl: Record<string, string> = { "ASM-1": "R. Patil", WELD: "S. Jadhav", CAL: "A. Shinde", MARK: "P. Kulkarni", PACK: "M. Deshmukh" };
      const units = all<{ serial_no: string }>(`SELECT serial_no FROM wip_units WHERE order_id = ? ORDER BY id`, ord.id).map(u => u.serial_no);
      const stopAt = (i: number) => (i < 70 ? 5 : i < 100 ? 3 : i < 125 ? 2 : i < 135 ? 1 : 0); // ops completed
      units.forEach((s, i) => {
        for (let k = 0; k < stopAt(i); k++) {
          const op = ops[k];
          const forceFail = op.station === "CAL" && (i === 12 || i === 33 || i === 51 || i === 88 || i === 95);
          const vals = simulate(op.params, 0);
          if (forceFail) vals[i === 33 ? "ins" : "acc600"] = i === 33 ? 62 : 6.4;
          const r = this.recordOp({ serial: s, station: op.station, operator: ppl[op.station], values: vals });
          if (r.result === "FAIL") {
            if (i === 88 || i === 95) return; // leave on hold at CAL
            if (i === 51) { this.disposition({ serial: s, action: "SCRAP", reason: "Insulation breakdown — MI cable sheath crack", operator: "A. Shinde" }); return; }
            this.disposition({ serial: s, action: "REWORK", reason: "Re-seat thermocouple junction", operator: "A. Shinde" });
            this.recordOp({ serial: s, station: op.station, operator: ppl[op.station], values: simulate(op.params, 0) });
          }
        }
      });
      void rel;
    }

    // Quality: PPAP register, a historical inspection and NCR
    const cust = Object.fromEntries(phase2.listParties("CUSTOMER").map(p => [p.code, p.id]));
    const pp = (code: string, c: string, status: string, sub: string | null, app: string | null, remarks = "") => { const it = byCode.get(code); if (it && cust[c]) run(`INSERT INTO ppap (item_id, customer_id, level, status, submitted_on, approved_on, remarks) VALUES (?,?,3,?,?,?,?)`, it.id, cust[c], status, sub, app, remarks); };
    const keys = Object.keys(cust);
    const [c1, c2, c3] = [keys.find(k => k.includes("APEX")) ?? keys[0], keys.find(k => k.includes("NORTH")) ?? keys[1], keys.find(k => k.includes("DECCAN")) ?? keys[2]];
    pp("FG-NOX-BS6", c1, "APPROVED", "2026-05-12", "2026-06-20"); pp("FG-EGTS-TC", c1, "APPROVED", "2026-04-02", "2026-05-08"); pp("FG-LD6000-D1", c1, "APPROVED", "2026-06-15", "2026-07-30");
    pp("FG-NOX-BS6", c2, "APPROVED", "2026-06-01", "2026-07-11"); pp("FG-DPS-SENT", c2, "INTERIM", "2026-08-20", null, "Interim approval till 31-Dec; capability study (Cpk) pending");
    pp("FG-UQS-US", c3, "APPROVED", "2026-03-18", "2026-04-25"); pp("FG-LD6549", c3, "SUBMITTED", "2026-09-28", null, "PSW submitted; awaiting customer SQE review"); pp("FG-EGTS-NTC", c3, "PENDING", null, null, "Run-at-rate planned in Nov");
    const con = byCode.get("RM-CON-4P");
    if (con) {
      run(`INSERT INTO inspections (insp_no, date, item_id, batch_no, ref, qty, sample, checks, accepted, rejected, result, inspector) VALUES ('IQC/2609/0001','2026-09-22',?, 'C4-2609-017','GRN-OPENING',2010,125,?,2000,10,'PARTIAL','N. More')`, con.id, JSON.stringify({ coc: true, visual: false, dimensional: true }));
      run(`INSERT INTO ncrs (ncr_no, date, source, ref, item_id, batch_no, serial_no, qty, defect, disposition, status, closed_on, remarks) VALUES ('NCR/2609/0001','2026-09-22','INCOMING','GRN-OPENING / IQC/2609/0001',?, 'C4-2609-017', NULL, 10, 'Bent terminal pins', 'RTV', 'CLOSED', '2026-09-24', 'Returned with debit note DN/26-27/0007')`, con.id);
    }
  }
}

export const phase3 = new Phase3();
phase3.seed();
