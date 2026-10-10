/**
 * Phase 4 — Job work (Sec. 143 CGST, Rule 45 challans, ITC-04), credit / debit notes (Sec. 34),
 * GST portal integration (IRN, e-way bill) through a GSP adapter, invoice cancellation,
 * and management dashboards (OEE, FPY, order book, inventory ageing).
 */
import crypto from "crypto";
import { sqlite, storage, ErpError } from "./storage";
import { phase2, fyOf, gstSplit } from "./phase2";
import { phase3, STATIONS } from "./phase3";
import { GSTIN_RE, gstinCheckChar, type InvoiceLine } from "@shared/schema";

const all = <T = any>(q: string, ...p: any[]) => sqlite.prepare(q).all(...p) as T[];
const one = <T = any>(q: string, ...p: any[]) => sqlite.prepare(q).get(...p) as T | undefined;
const run = (q: string, ...p: any[]) => sqlite.prepare(q).run(...p);
const today = () => new Date().toISOString().slice(0, 10);
const nowTs = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addYears = (d: string, n: number) => `${+d.slice(0, 4) + n}${d.slice(4)}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const nextNo = (table: string, col: string, prefix: string) =>
  prefix + String(((one<any>(`SELECT COUNT(*) c FROM ${table} WHERE ${col} LIKE ?`, prefix + "%")?.c) ?? 0) + 1).padStart(4, "0");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dmy = (d: string) => d.split("-").reverse().join("/");

/** GSTIN check digit (mod-36 algorithm used by GSTN) */
export function gstinValid(g: string) { return GSTIN_RE.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14]; }

export type JwKind = "INPUT" | "CAPITAL" | "TOOL";
export const KIND_LABEL: Record<JwKind, string> = { INPUT: "Inputs", CAPITAL: "Capital goods", TOOL: "Moulds, dies, jigs, fixtures, tools" };
export const CRN_REASONS = ["Sales return", "Rate difference (price reduced)", "Discount after sale", "Quality claim", "Short supply"];
export const DBN_REASONS = ["Rate difference (price increased)", "Short billing", "Freight / other charges"];
export const DOWNTIME_REASONS = ["Breakdown", "Changeover / setup", "Material shortage", "No operator", "Quality hold", "Planned maintenance"];
export const CANCEL_REASONS: Record<string, string> = { "1": "Duplicate", "2": "Data entry mistake", "3": "Order cancelled", "4": "Others" };

type Cfg = { gspMode: "SIMULATED" | "LIVE"; gspProvider: string; gspEnv: "SANDBOX" | "PRODUCTION"; aatoAbove5Cr: number; aato10Cr: number; plannedMin: number };

class Phase4 {
  // ====================== config ======================
  cfg(): Cfg {
    const r = one<any>(`SELECT * FROM p4_config WHERE id = 1`);
    return { gspMode: r.gsp_mode, gspProvider: r.gsp_provider, gspEnv: r.gsp_env, aatoAbove5Cr: r.aato_above_5cr, aato10Cr: r.aato_10cr, plannedMin: r.planned_min };
  }
  saveCfg(d: Partial<Cfg>) {
    const c = { ...this.cfg(), ...d };
    run(`UPDATE p4_config SET gsp_mode=?, gsp_provider=?, gsp_env=?, aato_above_5cr=?, aato_10cr=?, planned_min=? WHERE id = 1`,
      c.gspMode, c.gspProvider, c.gspEnv, c.aatoAbove5Cr ? 1 : 0, c.aato10Cr ? 1 : 0, c.plannedMin);
    return this.cfg();
  }
  liveStatus() {
    const need = ["GSP_BASE_URL", "GSP_CLIENT_ID", "GSP_CLIENT_SECRET", "GSP_USERNAME", "GSP_PASSWORD"];
    return { missing: need.filter(k => !process.env[k]) };
  }
  private whId(code: string) { return storage.listWarehouses().find(w => w.code === code)!.id; }
  private party(id: number) { return phase2.getParty(id)!; }

  // ====================== JOB WORK — OUTWARD (Tau is the principal) ======================
  dueDate(date: string, kind: JwKind) { return kind === "INPUT" ? addYears(date, 1) : kind === "CAPITAL" ? addYears(date, 3) : null; }
  private lineView(l: any, chDate: string) {
    const pending = r2(l.qty - l.received_qty - l.loss_qty - l.deemed_qty);
    const due = this.dueDate(chDate, l.kind);
    const daysLeft = due && pending > 0 ? daysBetween(today(), due) : null;
    return { id: l.id, itemId: l.item_id, code: l.item_id ? storage.getItem(l.item_id)?.code ?? "" : "", description: l.description, hsn: l.hsn, uom: l.uom,
      qty: l.qty, rate: l.rate, value: l.value, kind: l.kind as JwKind, batchNo: l.batch_no, gstRate: l.gst_rate,
      receivedQty: l.received_qty, lossQty: l.loss_qty, deemedQty: l.deemed_qty, pending, due, daysLeft,
      overdue: daysLeft != null && daysLeft < 0 };
  }
  private challanView(c: any) {
    const jw = this.party(c.jobworker_id);
    const cfg = phase2.getSettings();
    const lines = all(`SELECT * FROM jwo_lines WHERE challan_id = ? ORDER BY id`, c.id).map(l => this.lineView(l, c.date));
    const value = r2(lines.reduce((s, l) => s + l.value, 0));
    const interstate = jw.stateCode !== cfg.stateCode;
    const pendingAny = lines.some(l => l.pending > 0);
    const receivedAny = lines.some(l => l.receivedQty + l.lossQty + l.deemedQty > 0);
    const daysLeft = lines.filter(l => l.daysLeft != null).reduce<number | null>((m, l) => m == null ? l.daysLeft : Math.min(m, l.daysLeft!), null);
    const status = !pendingAny ? "CLOSED" : daysLeft != null && daysLeft < 0 ? "OVERDUE" : receivedAny ? "PARTIAL" : "OPEN";
    const receipts = all(`SELECT * FROM jwo_receipts WHERE challan_id = ? ORDER BY id`, c.id).map(r => ({ id: r.id, recNo: r.rec_no, date: r.date, jwChallanNo: r.jw_challan_no, jwChallanDate: r.jw_challan_date, lines: JSON.parse(r.lines), note: r.note }));
    const edoc = this.edoc("JWO", c.id);
    return { id: c.id, challanNo: c.challan_no, date: c.date, process: c.process, expectedReturn: c.expected_return, vehicleNo: c.vehicle_no, transporter: c.transporter,
      distanceKm: c.distance_km, note: c.note, jobworker: { id: jw.id, name: jw.name, gstin: jw.gstin, stateCode: jw.stateCode, address: jw.address, city: jw.city, pincode: jw.pincode },
      lines, value, interstate, ewbRequired: interstate || value > 50000, ewb: edoc ? { no: edoc.ewb_no, dt: edoc.ewb_dt, validTill: edoc.ewb_valid_till, status: edoc.ewb_status } : null,
      status, daysLeft, receipts };
  }
  listChallans() { return all(`SELECT * FROM jwo_challans ORDER BY id DESC`).map(c => this.challanView(c)); }
  getChallan(id: number) { const c = one(`SELECT * FROM jwo_challans WHERE id = ?`, id); if (!c) throw new ErpError("Challan not found"); return this.challanView(c); }

  createChallan(d: { jobworkerId: number; date?: string; process: string; expectedReturn: string | null; vehicleNo: string | null; transporter: string | null; distanceKm: number | null; note?: string;
    lines: { itemId: number | null; description?: string; hsn?: string; uom?: string; qty: number; rate?: number | null; kind: JwKind; batchNo?: string | null }[] }) {
    const date = d.date ?? today();
    const jw = phase2.getParty(d.jobworkerId);
    if (!jw || jw.role !== "JOBWORKER") throw new ErpError("Select a job worker (Customers & Vendors → role Job worker)");
    if (!d.process.trim()) throw new ErpError("Describe the job work process (e.g. nickel plating)");
    if (!d.lines.length) throw new ErpError("Add at least one line");
    const challanNo = nextNo("jwo_challans", "challan_no", `JWO/${fyOf(date)}/`);
    if (challanNo.length > 16) throw new ErpError("Challan number exceeds 16 characters (Rule 55)");
    const rm = this.whId("RM"), jwWh = this.whId("JW");
    let id = 0;
    sqlite.transaction(() => {
      id = Number(run(`INSERT INTO jwo_challans (challan_no, date, jobworker_id, process, expected_return, vehicle_no, transporter, distance_km, note) VALUES (?,?,?,?,?,?,?,?,?)`,
        challanNo, date, jw.id, d.process.trim(), d.expectedReturn || null, d.vehicleNo || null, d.transporter || null, d.distanceKm ?? jw.distanceKm, d.note ?? "").lastInsertRowid);
      const ins = sqlite.prepare(`INSERT INTO jwo_lines (challan_id, item_id, description, hsn, uom, qty, rate, value, kind, batch_no, gst_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      for (const l of d.lines) {
        if (!(l.qty > 0)) throw new ErpError("Quantity must be more than 0");
        if (l.itemId) {
          const it = storage.getItem(l.itemId);
          if (!it) throw new ErpError("Item not found");
          const rate = l.rate ?? (it.type === "RM" ? it.stdCost : r2(storage.rolledCost(it.id)));
          const batches = storage.stockByBatch().filter(b => b.itemId === it.id && b.warehouseId === rm && (!l.batchNo || b.batchNo === l.batchNo));
          const avail = batches.reduce((s, b) => s + b.qty, 0);
          if (avail < l.qty - 1e-9) throw new ErpError(`${it.code}: only ${avail} in Raw Material Stores${l.batchNo ? ` (batch ${l.batchNo})` : ""}`);
          let need = l.qty;
          for (const b of batches) {
            if (need <= 0) break;
            const q = Math.min(need, b.qty);
            storage.addTxn({ date, itemId: it.id, warehouseId: rm, qty: -q, txnType: "JW_OUT", ref: challanNo, batchNo: b.batchNo, unitCost: rate });
            storage.addTxn({ date, itemId: it.id, warehouseId: jwWh, qty: q, txnType: "JW_OUT", ref: challanNo, batchNo: b.batchNo, unitCost: rate });
            ins.run(id, it.id, it.name, it.hsn, it.uom, q, rate, r2(q * rate), l.kind, b.batchNo, it.gstRate);
            need -= q;
          }
        } else {
          if (!l.description?.trim() || !l.hsn?.trim()) throw new ErpError("Description and HSN are required for non-stock lines");
          if (!(l.rate! > 0)) throw new ErpError(`${l.description}: enter a value per unit`);
          ins.run(id, null, l.description.trim(), l.hsn.trim(), l.uom || "NOS", l.qty, l.rate, r2(l.qty * l.rate!), l.kind, null, 18);
        }
      }
    })();
    return this.getChallan(id);
  }

  receiveBack(d: { challanId: number; date?: string; jwChallanNo: string; jwChallanDate: string | null; note?: string; lines: { lineId: number; qty: number; lossQty: number }[] }) {
    const date = d.date ?? today();
    const ch = this.getChallan(d.challanId);
    const take = d.lines.filter(l => l.qty > 0 || l.lossQty > 0);
    if (!take.length) throw new ErpError("Enter the quantity received back");
    if (!d.jwChallanNo.trim()) throw new ErpError("Enter the job worker's challan number");
    const rm = this.whId("RM"), jwWh = this.whId("JW");
    const recNo = nextNo("jwo_receipts", "rec_no", `JWR/${fyOf(date)}/`);
    sqlite.transaction(() => {
      for (const l of take) {
        const ln = ch.lines.find(x => x.id === l.lineId);
        if (!ln) throw new ErpError("Line mismatch");
        if (l.qty < 0 || l.lossQty < 0) throw new ErpError("Quantities cannot be negative");
        if (l.qty + l.lossQty > ln.pending + 1e-9) throw new ErpError(`${ln.description}: ${l.qty + l.lossQty} entered but only ${ln.pending} pending at job worker`);
        if (ln.itemId) {
          if (l.qty > 0) {
            storage.addTxn({ date, itemId: ln.itemId, warehouseId: jwWh, qty: -l.qty, txnType: "JW_IN", ref: recNo, batchNo: ln.batchNo, unitCost: ln.rate });
            storage.addTxn({ date, itemId: ln.itemId, warehouseId: rm, qty: l.qty, txnType: "JW_IN", ref: recNo, batchNo: ln.batchNo, unitCost: ln.rate });
          }
          if (l.lossQty > 0) storage.addTxn({ date, itemId: ln.itemId, warehouseId: jwWh, qty: -l.lossQty, txnType: "JW_LOSS", ref: recNo, batchNo: ln.batchNo, unitCost: ln.rate });
        }
        run(`UPDATE jwo_lines SET received_qty = received_qty + ?, loss_qty = loss_qty + ? WHERE id = ?`, l.qty, l.lossQty, l.lineId);
      }
      run(`INSERT INTO jwo_receipts (rec_no, date, challan_id, jw_challan_no, jw_challan_date, lines, note) VALUES (?,?,?,?,?,?,?)`,
        recNo, date, ch.id, d.jwChallanNo.trim(), d.jwChallanDate || date, JSON.stringify(take), d.note ?? "");
    })();
    return this.getChallan(ch.id);
  }

  /** Goods not returned in time are deemed supplied by the principal on the date they were sent (Sec. 143(3)/(4)) */
  deemedSupply(lineId: number) {
    const l = one<any>(`SELECT * FROM jwo_lines WHERE id = ?`, lineId);
    if (!l) throw new ErpError("Line not found");
    const ch = this.getChallan(l.challan_id);
    const v = ch.lines.find(x => x.id === lineId)!;
    if (!(v.pending > 0)) throw new ErpError("Nothing pending on this line");
    if (!v.overdue) throw new ErpError("This line is still within its return period");
    const taxable = r2(v.pending * v.rate), tax = r2(taxable * v.gstRate / 100);
    const interest = r2(tax * 0.18 * daysBetween(ch.date, today()) / 365);
    sqlite.transaction(() => {
      if (v.itemId) storage.addTxn({ date: today(), itemId: v.itemId, warehouseId: this.whId("JW"), qty: -v.pending, txnType: "JW_DEEMED", ref: ch.challanNo, batchNo: v.batchNo, unitCost: v.rate });
      run(`UPDATE jwo_lines SET deemed_qty = deemed_qty + ? WHERE id = ?`, v.pending, lineId);
      run(`INSERT INTO jwo_deemed (date, line_id, challan_id, qty, taxable, gst_rate, tax, interest_est, supply_date) VALUES (?,?,?,?,?,?,?,?,?)`,
        today(), lineId, ch.id, v.pending, taxable, v.gstRate, tax, interest, ch.date);
    })();
    return { taxable, tax, interest };
  }
  listDeemed() {
    return all(`SELECT d.*, c.challan_no, l.description, p.name jw FROM jwo_deemed d JOIN jwo_challans c ON c.id = d.challan_id JOIN jwo_lines l ON l.id = d.line_id JOIN parties p ON p.id = c.jobworker_id ORDER BY d.id DESC`);
  }

  // ---------- ITC-04 ----------
  itc04Periods(fy: string) {
    const y = 2000 + +fy.slice(0, 2);
    const half = !!this.cfg().aatoAbove5Cr;
    return half
      ? [{ key: "H1", label: `Apr–Sep ${y}`, from: `${y}-04-01`, to: `${y}-09-30`, due: `${y}-10-25` }, { key: "H2", label: `Oct ${y}–Mar ${y + 1}`, from: `${y}-10-01`, to: `${y + 1}-03-31`, due: `${y + 1}-04-25` }]
      : [{ key: "FY", label: `FY ${y}-${String(y + 1).slice(2)}`, from: `${y}-04-01`, to: `${y + 1}-03-31`, due: `${y + 1}-04-25` }];
  }
  itc04(fy: string, period: string) {
    const p = this.itc04Periods(fy).find(x => x.key === period) ?? this.itc04Periods(fy)[0];
    const t4 = all(`SELECT c.challan_no, c.date, l.*, p.gstin, p.state_code, p.name jw FROM jwo_lines l JOIN jwo_challans c ON c.id = l.challan_id JOIN parties p ON p.id = c.jobworker_id
      WHERE c.date BETWEEN ? AND ? ORDER BY c.date, l.id`, p.from, p.to).map(r => ({
        jwGstin: r.gstin, jwState: r.state_code, jw: r.jw, challanNo: r.challan_no, challanDate: r.date, kind: KIND_LABEL[r.kind as JwKind],
        description: r.description, hsn: r.hsn, uqc: r.uom, qty: r.qty, taxable: r.value, gstRate: r.gst_rate }));
    const t5a: any[] = [];
    for (const r of all(`SELECT r.*, c.challan_no, c.date cdate, p.gstin, p.state_code, p.name jw FROM jwo_receipts r JOIN jwo_challans c ON c.id = r.challan_id JOIN parties p ON p.id = c.jobworker_id
      WHERE r.date BETWEEN ? AND ? ORDER BY r.date, r.id`, p.from, p.to)) {
      for (const l of JSON.parse(r.lines)) {
        const ln = one<any>(`SELECT * FROM jwo_lines WHERE id = ?`, l.lineId);
        t5a.push({ jwGstin: r.gstin, jwState: r.state_code, jw: r.jw, origChallanNo: r.challan_no, origChallanDate: r.cdate, jwChallanNo: r.jw_challan_no, jwChallanDate: r.jw_challan_date,
          description: ln.description, uqc: ln.uom, qty: l.qty, lossQty: l.lossQty, receivedOn: r.date });
      }
    }
    return { fy, period: p, periods: this.itc04Periods(fy), half: !!this.cfg().aatoAbove5Cr, table4: t4, table5A: t5a, table5B: [], table5C: [],
      daysToDue: daysBetween(today(), p.due) };
  }
  itc04Csv(fy: string, period: string, table: "4" | "5A") {
    const d = this.itc04(fy, period);
    const q = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    if (table === "4") {
      const h = ["GSTIN of Job Worker", "State (if job worker unregistered)", "Challan Number", "Challan Date", "Types of Goods", "Description of Goods", "HSN", "Unique Quantity Code (UQC)", "Quantity", "Taxable Value", "Integrated Tax Rate (%)", "Central Tax Rate (%)", "State/UT Tax Rate (%)", "Cess"];
      const cfgState = phase2.getSettings().stateCode;
      const rows = d.table4.map(r => [r.jwGstin, r.jwGstin ? "" : r.jwState, r.challanNo, dmy(r.challanDate), r.kind, r.description, r.hsn, r.uqc, r.qty, r.taxable,
        r.jwState !== cfgState ? r.gstRate : 0, r.jwState === cfgState ? r.gstRate / 2 : 0, r.jwState === cfgState ? r.gstRate / 2 : 0, 0]);
      return [h, ...rows].map(r => r.map(q).join(",")).join("\n") + "\n";
    }
    const h = ["GSTIN of Job Worker", "State (if job worker unregistered)", "Original Challan Number", "Original Challan Date", "Challan Number issued by job worker", "Challan Date issued by job worker", "Nature of Job Work done", "Description of Goods", "Unique Quantity Code (UQC)", "Quantity", "Losses & Wastes UQC", "Losses & Wastes Quantity"];
    const rows = d.table5A.map(r => {
      const c = one<any>(`SELECT process FROM jwo_challans WHERE challan_no = ?`, r.origChallanNo);
      return [r.jwGstin, "", r.origChallanNo, dmy(r.origChallanDate), r.jwChallanNo, dmy(r.jwChallanDate), c?.process ?? "", r.description, r.uqc, r.qty, r.lossQty ? r.uqc : "", r.lossQty || ""];
    });
    return [h, ...rows].map(r => r.map(q).join(",")).join("\n") + "\n";
  }

  // ====================== JOB WORK — INWARD (Tau is the job worker) ======================
  private inwardView(r: any) {
    const pr = this.party(r.principal_id);
    const lines = JSON.parse(r.lines) as { description: string; hsn: string; uom: string; qty: number; value: number; returned: number; scrap: number }[];
    const ls = lines.map((l, idx) => ({ ...l, idx, pending: r2(l.qty - l.returned - l.scrap) }));
    const returns = all(`SELECT * FROM jwi_returns WHERE receipt_id = ? ORDER BY id`, r.id).map(x => this.returnView(x));
    return { id: r.id, recNo: r.rec_no, date: r.date, principal: { id: pr.id, name: pr.name, gstin: pr.gstin, stateCode: pr.stateCode }, principalChallanNo: r.principal_challan_no,
      principalChallanDate: r.principal_challan_date, process: r.process, chargeRate: r.charge_rate, lines: ls, daysHeld: daysBetween(r.principal_challan_date, today()),
      status: ls.every(l => l.pending <= 0) ? "CLOSED" : returns.some(x => x.status === "ACTIVE") ? "PARTIAL" : "OPEN", returns };
  }
  private returnView(x: any) {
    return { id: x.id, retNo: x.ret_no, invNo: x.inv_no, date: x.date, receiptId: x.receipt_id, lines: JSON.parse(x.lines), sac: x.sac, chargeRate: x.charge_rate, gstRate: x.gst_rate,
      taxable: x.taxable, cgst: x.cgst, sgst: x.sgst, igst: x.igst, roundOff: x.round_off, total: x.total, vehicleNo: x.vehicle_no, status: x.status };
  }
  listInward() { return all(`SELECT * FROM jwi_receipts ORDER BY id DESC`).map(r => this.inwardView(r)); }
  getInward(id: number) { const r = one(`SELECT * FROM jwi_receipts WHERE id = ?`, id); if (!r) throw new ErpError("Inward job work receipt not found"); return this.inwardView(r); }
  createInward(d: { principalId: number; date?: string; principalChallanNo: string; principalChallanDate: string; process: string; chargeRate: number; lines: { description: string; hsn: string; uom: string; qty: number; value: number }[] }) {
    const date = d.date ?? today();
    const p = phase2.getParty(d.principalId);
    if (!p) throw new ErpError("Select the principal (customer who owns the goods)");
    if (!d.principalChallanNo.trim()) throw new ErpError("Enter the principal's challan number");
    if (!d.lines.length || d.lines.some(l => !l.description.trim() || !(l.qty > 0))) throw new ErpError("Each line needs a description and quantity");
    const recNo = nextNo("jwi_receipts", "rec_no", `JIN/${fyOf(date)}/`);
    const id = Number(run(`INSERT INTO jwi_receipts (rec_no, date, principal_id, principal_challan_no, principal_challan_date, process, charge_rate, lines) VALUES (?,?,?,?,?,?,?,?)`,
      recNo, date, p.id, d.principalChallanNo.trim(), d.principalChallanDate || date, d.process.trim(), d.chargeRate,
      JSON.stringify(d.lines.map(l => ({ ...l, returned: 0, scrap: 0 })))).lastInsertRowid);
    return this.getInward(id);
  }
  /** Return processed goods to the principal: delivery challan + job work charges invoice (SAC 9988) */
  returnInward(d: { receiptId: number; date?: string; sac: string; chargeRate: number; gstRate: number; vehicleNo: string | null; lines: { idx: number; qty: number; scrapQty: number }[] }) {
    const date = d.date ?? today();
    const rec = this.getInward(d.receiptId);
    const take = d.lines.filter(l => l.qty > 0 || l.scrapQty > 0);
    if (!take.length) throw new ErpError("Enter the quantity being returned");
    if (!/^\d{4,8}$/.test(d.sac)) throw new ErpError("SAC must be 4–8 digits (job work is heading 9988)");
    const cfg = phase2.getSettings();
    const raw = one<any>(`SELECT lines FROM jwi_receipts WHERE id = ?`, rec.id);
    const lines = JSON.parse(raw.lines);
    let qtyBilled = 0;
    for (const l of take) {
      const ln = rec.lines[l.idx];
      if (!ln) throw new ErpError("Line mismatch");
      if (l.qty + l.scrapQty > ln.pending + 1e-9) throw new ErpError(`${ln.description}: only ${ln.pending} pending`);
      lines[l.idx].returned += l.qty; lines[l.idx].scrap += l.scrapQty; qtyBilled += l.qty;
    }
    const taxable = r2(qtyBilled * d.chargeRate);
    const g = gstSplit(taxable, d.gstRate, cfg.stateCode, rec.principal.stateCode);
    const gross = r2(taxable + g.cgst + g.sgst + g.igst), total = Math.round(gross);
    const retNo = nextNo("jwi_returns", "ret_no", `JRT/${fyOf(date)}/`);
    const invNo = nextNo("jwi_returns", "inv_no", `JWI/${fyOf(date)}/`);
    let id = 0;
    sqlite.transaction(() => {
      run(`UPDATE jwi_receipts SET lines = ? WHERE id = ?`, JSON.stringify(lines), rec.id);
      id = Number(run(`INSERT INTO jwi_returns (ret_no, inv_no, date, receipt_id, lines, sac, charge_rate, gst_rate, taxable, cgst, sgst, igst, round_off, total, vehicle_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        retNo, invNo, date, rec.id, JSON.stringify(take), d.sac, d.chargeRate, d.gstRate, taxable, g.cgst, g.sgst, g.igst, r2(total - gross), total, d.vehicleNo || null).lastInsertRowid);
    })();
    return this.getReturn(id);
  }
  getReturn(id: number) {
    const x = one(`SELECT * FROM jwi_returns WHERE id = ?`, id);
    if (!x) throw new ErpError("Job work invoice not found");
    const v = this.returnView(x);
    const rec = this.getInward(v.receiptId);
    return { ...v, receipt: { ...rec, returns: undefined }, edoc: this.edocView("JWI", id) };
  }
  private voidReturn(id: number) {
    const v = this.getReturn(id);
    const raw = JSON.parse(one<any>(`SELECT lines FROM jwi_receipts WHERE id = ?`, v.receiptId).lines);
    for (const l of v.lines) { raw[l.idx].returned -= l.qty; raw[l.idx].scrap -= l.scrapQty; }
    run(`UPDATE jwi_receipts SET lines = ? WHERE id = ?`, JSON.stringify(raw), v.receiptId);
    run(`UPDATE jwi_returns SET status = 'CANCELLED' WHERE id = ?`, id);
  }

  // ====================== CREDIT / DEBIT NOTES (Sec. 34) ======================
  crnDeadline(invDate: string) { return `20${fyOf(invDate).slice(3)}-11-30`; }
  private noteView(n: any) {
    const inv = phase2.getInvoice(n.invoice_id)!;
    const c = this.party(n.customer_id);
    return { id: n.id, noteNo: n.note_no, typ: n.typ as "CRN" | "DBN", date: n.date, invoiceId: n.invoice_id, invNo: inv.invNo, invDate: inv.date, reason: n.reason, kind: n.kind,
      customer: { id: c.id, name: c.name, gstin: c.gstin, stateCode: c.stateCode, address: c.address, city: c.city, pincode: c.pincode },
      lines: JSON.parse(n.lines), taxable: n.taxable, cgst: n.cgst, sgst: n.sgst, igst: n.igst, roundOff: n.round_off, total: n.total, status: n.status, edoc: this.edocView(n.typ, n.id) };
  }
  listNotes() { return all(`SELECT * FROM notes ORDER BY id DESC`).map(n => this.noteView(n)); }
  getNote(id: number) { const n = one(`SELECT * FROM notes WHERE id = ?`, id); if (!n) throw new ErpError("Note not found"); return this.noteView(n); }
  notesForInvoice(invoiceId: number) { return all(`SELECT * FROM notes WHERE invoice_id = ? ORDER BY id`, invoiceId).map(n => this.noteView(n)); }
  /** What can still be credited / returned per invoice line */
  noteHeadroom(invoiceId: number) {
    const inv = phase2.getInvoice(invoiceId);
    if (!inv) throw new ErpError("Invoice not found");
    const lines = JSON.parse(inv.lines) as InvoiceLine[];
    const notes = all<any>(`SELECT * FROM notes WHERE invoice_id = ? AND status = 'ACTIVE'`, invoiceId);
    return lines.map((l, idx) => {
      let credited = 0, returned = 0; const returnedSerials: string[] = [];
      for (const n of notes) for (const nl of JSON.parse(n.lines)) if (nl.idx === idx && n.typ === "CRN") {
        credited += nl.taxable; if (n.kind === "RETURN") { returned += nl.qty; returnedSerials.push(...(nl.serials ?? [])); }
      }
      return { idx, code: l.code, name: l.name, hsn: l.hsn, uom: l.uom, qty: l.qty, rate: l.rate, taxable: l.taxable, gstRate: l.gstRate,
        creditable: r2(l.taxable - credited), returnable: l.qty - returned, serials: l.serials.filter(s => !returnedSerials.includes(s)) };
    });
  }
  createNote(d: { typ: "CRN" | "DBN"; invoiceId: number; date?: string; reason: string; lines: { idx: number; qty: number; rate: number; serials?: string[] }[] }) {
    const date = d.date ?? today();
    const inv = phase2.getInvoice(d.invoiceId);
    if (!inv) throw new ErpError("Invoice not found");
    if (inv.status === "CANCELLED") throw new ErpError("This invoice is cancelled");
    if (date < inv.date) throw new ErpError("Note date cannot be before the invoice date");
    const reasons = d.typ === "CRN" ? CRN_REASONS : DBN_REASONS;
    if (!reasons.includes(d.reason)) throw new ErpError("Choose a reason");
    if (d.typ === "CRN" && date > this.crnDeadline(inv.date))
      throw new ErpError(`Credit notes against ${inv.invNo} had to be issued by ${dmy(this.crnDeadline(inv.date))} (Sec. 34(2): 30 November after the end of the financial year)`);
    const kind = d.typ === "CRN" && d.reason === "Sales return" ? "RETURN" : "VALUE";
    const head = this.noteHeadroom(inv.id);
    const cfg = phase2.getSettings();
    const take = d.lines.filter(l => l.qty > 0 && l.rate > 0);
    if (!take.length) throw new ErpError("Enter quantity and rate for at least one line");
    const out: any[] = [];
    for (const l of take) {
      const h = head[l.idx];
      if (!h) throw new ErpError("Line mismatch");
      if (l.qty > h.qty) throw new ErpError(`${h.code}: quantity ${l.qty} exceeds invoiced ${h.qty}`);
      if (kind === "RETURN") {
        if (l.qty > h.returnable) throw new ErpError(`${h.code}: only ${h.returnable} can still be returned`);
        if (Math.abs(l.rate - h.rate) > 0.001) throw new ErpError(`${h.code}: a sales return uses the invoiced rate ₹${h.rate}`);
      }
      const taxable = r2(l.qty * l.rate);
      if (d.typ === "CRN" && taxable > h.creditable + 0.01) throw new ErpError(`${h.code}: credit ₹${taxable} exceeds the remaining invoice value ₹${h.creditable}`);
      let serials: string[] = [];
      if (kind === "RETURN" && h.serials.length) {
        serials = (l.serials?.length ? l.serials : h.serials.slice(-l.qty));
        if (serials.length !== l.qty || serials.some(s => !h.serials.includes(s))) throw new ErpError(`${h.code}: pick ${l.qty} serial numbers from this invoice`);
      }
      out.push({ idx: l.idx, itemId: (JSON.parse(inv.lines) as InvoiceLine[])[l.idx].itemId, code: h.code, name: h.name, hsn: h.hsn, uom: h.uom, qty: l.qty, rate: l.rate, taxable, gstRate: h.gstRate,
        ...gstSplit(taxable, h.gstRate, cfg.stateCode, inv.placeOfSupply), serials });
    }
    const taxable = r2(out.reduce((s, l) => s + l.taxable, 0)), cgst = r2(out.reduce((s, l) => s + l.cgst, 0)), sgst = r2(out.reduce((s, l) => s + l.sgst, 0)), igst = r2(out.reduce((s, l) => s + l.igst, 0));
    const gross = r2(taxable + cgst + sgst + igst), total = Math.round(gross);
    const noteNo = nextNo("notes", "note_no", `${d.typ === "CRN" ? "CN" : "DN"}/${fyOf(date)}/`);
    let id = 0;
    sqlite.transaction(() => {
      id = Number(run(`INSERT INTO notes (note_no, typ, date, invoice_id, customer_id, reason, kind, lines, taxable, cgst, sgst, igst, round_off, total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        noteNo, d.typ, date, inv.id, inv.customerId, d.reason, kind, JSON.stringify(out), taxable, cgst, sgst, igst, r2(total - gross), total).lastInsertRowid);
      if (kind === "RETURN") {
        const qc = this.whId("QC");
        for (const l of out) {
          storage.addTxn({ date, itemId: l.itemId, warehouseId: qc, qty: l.qty, txnType: "SALES_RETURN", ref: noteNo, batchNo: `RET-${noteNo.slice(-4)}`, unitCost: r2(storage.rolledCost(l.itemId)) });
          for (const s of l.serials) run(`UPDATE serials SET status = 'RETURNED' WHERE serial_no = ?`, s);
        }
      }
    })();
    return this.getNote(id);
  }
  private voidNote(id: number) {
    const n = this.getNote(id);
    if (n.kind === "RETURN") {
      const qc = this.whId("QC");
      for (const l of n.lines) {
        const bal = storage.stockByBatch().find(b => b.itemId === l.itemId && b.warehouseId === qc && b.batchNo === `RET-${n.noteNo.slice(-4)}`);
        if (!bal || bal.qty < l.qty - 1e-9) throw new ErpError(`${l.code}: returned goods have already moved out of QC Quarantine — reverse that movement first`);
        storage.addTxn({ date: today(), itemId: l.itemId, warehouseId: qc, qty: -l.qty, txnType: "NOTE_CANCEL", ref: n.noteNo, batchNo: bal.batchNo, unitCost: 0 });
        for (const s of l.serials) run(`UPDATE serials SET status = 'DISPATCHED' WHERE serial_no = ?`, s);
      }
    }
    run(`UPDATE notes SET status = 'CANCELLED' WHERE id = ?`, id);
  }

  // ====================== INVOICE CANCELLATION ======================
  voidInvoice(id: number) {
    const inv = phase2.getInvoice(id);
    if (!inv) throw new ErpError("Invoice not found");
    if (inv.status === "CANCELLED") throw new ErpError("Already cancelled");
    const e = this.edoc("INV", id);
    if (e?.irn_status === "ACT") throw new ErpError("Cancel the IRN first (allowed within 24 hours of generation); after that, issue a credit note instead");
    if (all(`SELECT id FROM notes WHERE invoice_id = ? AND status = 'ACTIVE'`, id).length) throw new ErpError("Cancel the credit / debit notes against this invoice first");
    sqlite.transaction(() => {
      for (const t of all<any>(`SELECT * FROM stock_txns WHERE ref = ? AND txn_type = 'DISPATCH'`, inv.invNo))
        storage.addTxn({ date: today(), itemId: t.item_id, warehouseId: t.warehouse_id, qty: -t.qty, txnType: "INV_CANCEL", ref: inv.invNo, batchNo: t.batch_no, unitCost: t.unit_cost });
      run(`UPDATE serials SET status = 'IN_STOCK', invoice_id = NULL WHERE invoice_id = ?`, id);
      for (const l of JSON.parse(inv.lines) as InvoiceLine[]) run(`UPDATE so_lines SET dispatched_qty = dispatched_qty - ? WHERE id = ?`, l.qty, l.soLineId);
      const sl = all<any>(`SELECT qty, dispatched_qty FROM so_lines WHERE so_id = ?`, inv.soId);
      run(`UPDATE sales_orders SET status = ? WHERE id = ?`, sl.every(s => s.dispatched_qty <= 0) ? "OPEN" : "PARTIAL", inv.soId);
      run(`UPDATE pdi_reports SET invoice_id = NULL WHERE invoice_id = ?`, id);
      run(`UPDATE invoices SET status = 'CANCELLED' WHERE id = ?`, id);
    })();
    return phase2.getInvoice(id);
  }

  // ====================== GST PORTAL: IRN + E-WAY BILL ======================
  edoc(type: string, id: number) { return one<any>(`SELECT * FROM edocs WHERE doc_type = ? AND doc_id = ?`, type, id); }
  edocView(type: string, id: number) {
    const e = this.edoc(type, id);
    if (!e) return null;
    const age = e.irn_at ? (Date.now() - Date.parse(e.irn_at.replace(" ", "T") + "Z")) / 3600000 : null;
    const ewbAge = e.ewb_at ? (Date.now() - Date.parse(e.ewb_at.replace(" ", "T") + "Z")) / 3600000 : null;
    return { irn: e.irn, ackNo: e.ack_no, ackDt: e.ack_dt, signedQr: e.signed_qr, irnStatus: e.irn_status, irnAt: e.irn_at, cancelReason: e.cancel_reason,
      canCancelIrn: e.irn_status === "ACT" && age != null && age < 24 && e.ewb_status !== "ACT",
      ewbNo: e.ewb_no, ewbDt: e.ewb_dt, ewbValidTill: e.ewb_valid_till, ewbStatus: e.ewb_status, canCancelEwb: e.ewb_status === "ACT" && ewbAge != null && ewbAge < 24, mode: e.mode };
  }
  private log(docType: string, docNo: string, action: string, ok: boolean, message: string, request: any, response: any) {
    run(`INSERT INTO gsp_log (ts, doc_type, doc_no, action, mode, ok, message, request, response) VALUES (?,?,?,?,?,?,?,?,?)`,
      nowTs(), docType, docNo, action, this.cfg().gspMode, ok ? 1 : 0, message, JSON.stringify(request ?? null).slice(0, 4000), JSON.stringify(response ?? null).slice(0, 4000));
  }
  listLog() { return all(`SELECT id, ts, doc_type docType, doc_no docNo, action, mode, ok, message FROM gsp_log ORDER BY id DESC LIMIT 200`); }

  /** NIC e-invoice schema v1.1 JSON for any supported document */
  docJson(type: string, id: number): { json: any; docNo: string; total: number } {
    const cfg = phase2.getSettings();
    if (type === "INV") {
      const inv = phase2.getInvoice(id);
      if (!inv) throw new ErpError("Invoice not found");
      if (inv.status === "CANCELLED") throw new ErpError("Invoice is cancelled");
      return { json: phase2.eInvoiceJson(id), docNo: inv.invNo, total: inv.total };
    }
    const seller = { Gstin: cfg.gstin, LglNm: cfg.legalName, Addr1: cfg.address, Loc: cfg.city, Pin: +cfg.pincode, Stcd: cfg.stateCode };
    const buyerOf = (p: any, pos: string) => ({ Gstin: p.gstin, LglNm: p.name, Pos: pos, Addr1: p.address, Loc: p.city, Pin: +p.pincode, Stcd: p.stateCode });
    if (type === "CRN" || type === "DBN") {
      const n = this.getNote(id);
      if (n.status === "CANCELLED") throw new ErpError("Note is cancelled");
      const inv = phase2.getInvoice(n.invoiceId)!;
      return { docNo: n.noteNo, total: n.total, json: {
        Version: "1.1", TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: n.typ, No: n.noteNo, Dt: dmy(n.date) }, SellerDtls: seller, BuyerDtls: buyerOf(n.customer, inv.placeOfSupply),
        ItemList: n.lines.map((l: any, i: number) => ({ SlNo: String(i + 1), PrdDesc: `${l.name} — ${n.reason}`, IsServc: "N", HsnCd: l.hsn, Qty: l.qty, Unit: l.uom, UnitPrice: l.rate,
          TotAmt: l.taxable, AssAmt: l.taxable, GstRt: l.gstRate, IgstAmt: l.igst, CgstAmt: l.cgst, SgstAmt: l.sgst, TotItemVal: r2(l.taxable + l.igst + l.cgst + l.sgst) })),
        ValDtls: { AssVal: n.taxable, CgstVal: n.cgst, SgstVal: n.sgst, IgstVal: n.igst, RndOffAmt: n.roundOff, TotInvVal: n.total },
        RefDtls: { InvRm: n.reason, PrecDocDtls: [{ InvNo: inv.invNo, InvDt: dmy(inv.date) }] },
      } };
    }
    if (type === "JWI") {
      const r = this.getReturn(id);
      if (r.status === "CANCELLED") throw new ErpError("Invoice is cancelled");
      const p = this.party(r.receipt.principal.id);
      const qty = r.lines.reduce((s: number, l: any) => s + l.qty, 0);
      return { docNo: r.invNo, total: r.total, json: {
        Version: "1.1", TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: r.invNo, Dt: dmy(r.date) }, SellerDtls: seller, BuyerDtls: buyerOf(p, p.stateCode),
        ItemList: [{ SlNo: "1", PrdDesc: `Job work: ${r.receipt.process} (your challan ${r.receipt.principalChallanNo})`, IsServc: "Y", HsnCd: r.sac, Qty: qty, Unit: "NOS", UnitPrice: r.chargeRate,
          TotAmt: r.taxable, AssAmt: r.taxable, GstRt: r.gstRate, IgstAmt: r.igst, CgstAmt: r.cgst, SgstAmt: r.sgst, TotItemVal: r2(r.taxable + r.igst + r.cgst + r.sgst) }],
        ValDtls: { AssVal: r.taxable, CgstVal: r.cgst, SgstVal: r.sgst, IgstVal: r.igst, RndOffAmt: r.roundOff, TotInvVal: r.total },
      } };
    }
    throw new ErpError("Unsupported document type");
  }

  /** Checks the IRP performs before accepting a document (subset of the published error list) */
  private validate(json: any) {
    const errs: string[] = [];
    const S = json.SellerDtls, B = json.BuyerDtls;
    if (!gstinValid(S.Gstin)) errs.push("Seller GSTIN is invalid");
    if (!gstinValid(B.Gstin)) errs.push(`Buyer GSTIN ${B.Gstin} fails the GSTIN check digit — correct it in Customers & Vendors`);
    if (S.Gstin === B.Gstin) errs.push("Seller and buyer GSTIN cannot be the same");
    if (!/^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/.test(json.DocDtls.No)) errs.push("Document no. must be 1–16 characters (A–Z, 0–9, / -) and cannot start with 0, / or -");
    const dt = json.DocDtls.Dt.split("/").reverse().join("-");
    if (dt > today()) errs.push("Document date cannot be in the future");
    if (this.cfg().aato10Cr && daysBetween(dt, today()) > 30) errs.push("Turnover ₹10 Cr+: documents older than 30 days cannot be reported to the IRP");
    if (!json.ItemList.length || json.ItemList.length > 1000) errs.push("1 to 1000 line items allowed");
    for (const it of json.ItemList) if (!/^(\d{4}|\d{6}|\d{8})$/.test(it.HsnCd)) errs.push(`Line ${it.SlNo}: HSN/SAC ${it.HsnCd} must be 4, 6 or 8 digits`);
    const sum = json.ItemList.reduce((s: number, i: any) => s + i.AssAmt, 0);
    if (Math.abs(sum - json.ValDtls.AssVal) > 1) errs.push("Sum of item taxable values does not match the document total");
    if (errs.length) throw new ErpError("IRP validation failed: " + errs.join("; "));
  }

  private simulateIrn(json: any) {
    const fy = fyOf(json.DocDtls.Dt.split("/").reverse().join("-"));
    const irn = crypto.createHash("sha256").update(`${json.SellerDtls.Gstin}${fy}${json.DocDtls.Typ}${json.DocDtls.No}`).digest("hex");
    const ackNo = "1126" + String(parseInt(irn.slice(0, 12), 16) % 1e11).padStart(11, "0");
    const ackDt = nowTs();
    const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const data = { SellerGstin: json.SellerDtls.Gstin, BuyerGstin: json.BuyerDtls.Gstin, DocNo: json.DocDtls.No, DocTyp: json.DocDtls.Typ, DocDt: json.DocDtls.Dt,
      TotInvVal: json.ValDtls.TotInvVal, ItemCnt: json.ItemList.length, MainHsnCode: json.ItemList[0].HsnCd, Irn: irn, IrnDt: ackDt };
    const signedQr = `${b64({ alg: "RS256", kid: "SIMULATED", typ: "JWT" })}.${b64({ data: JSON.stringify(data), iss: "NIC Sandbox (simulated by Tau Power ERP)" })}.SIMULATED-NOT-SIGNED`;
    return { Irn: irn, AckNo: ackNo, AckDt: ackDt, SignedQRCode: signedQr, Status: "ACT" };
  }
  private async live(path: string, body: any): Promise<any> {
    const miss = this.liveStatus().missing;
    if (miss.length) throw new ErpError(`Live GST portal connection is not set up. Add ${miss.join(", ")} from your GSP as server environment variables, or switch back to Simulated mode in Tally & Company.`);
    const res = await fetch(`${process.env.GSP_BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", client_id: process.env.GSP_CLIENT_ID!, client_secret: process.env.GSP_CLIENT_SECRET!,
      user_name: process.env.GSP_USERNAME!, password: process.env.GSP_PASSWORD!, gstin: phase2.getSettings().gstin }, body: JSON.stringify(body) });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j.Status === 0 || j.status_cd === "0") throw new ErpError(`GSP error: ${JSON.stringify(j.ErrorDetails ?? j.error ?? j).slice(0, 300)}`);
    return j.Data ?? j.data ?? j;
  }
  private markDoc(type: string, id: number, irn: string | null, ackNo: string | null, ewbNo: string | null) {
    if (type === "INV") run(`UPDATE invoices SET irn = ?, ack_no = ?, ewb_no = COALESCE(?, ewb_no) WHERE id = ?`, irn, ackNo, ewbNo, id);
  }

  /** IRN / EWB obtained outside the ERP (e.g. typed in from the IRP portal) */
  recordManual(type: string, id: number, d: { irn?: string | null; ackNo?: string | null; ackDt?: string | null; ewbNo?: string | null }) {
    if (d.irn && !/^[0-9a-f]{64}$/i.test(d.irn)) throw new ErpError("IRN must be the 64-character hash returned by the IRP");
    if (d.ewbNo && !/^\d{12}$/.test(d.ewbNo)) throw new ErpError("E-way bill number is 12 digits");
    const docNo = type === "INV" ? phase2.getInvoice(id)?.invNo ?? "" : this.docJson(type, id).docNo;
    run(`INSERT INTO edocs (doc_type, doc_id, doc_no, irn, ack_no, ack_dt, irn_status, irn_at, ewb_no, ewb_status, ewb_at, mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,'MANUAL')
      ON CONFLICT(doc_type, doc_id) DO UPDATE SET irn=excluded.irn, ack_no=excluded.ack_no, ack_dt=excluded.ack_dt, irn_status=excluded.irn_status, irn_at=COALESCE(edocs.irn_at, excluded.irn_at), ewb_no=excluded.ewb_no, ewb_status=excluded.ewb_status, ewb_at=COALESCE(edocs.ewb_at, excluded.ewb_at)`,
      type, id, docNo, d.irn || null, d.ackNo || null, d.ackDt || null, d.irn ? "ACT" : null, d.irn ? nowTs() : null, d.ewbNo || null, d.ewbNo ? "ACT" : null, d.ewbNo ? nowTs() : null);
    this.markDoc(type, id, d.irn || null, d.ackNo || null, d.ewbNo || null);
    this.log(type, docNo, "MANUAL_ENTRY", true, `IRN ${d.irn ? "entered" : "-"} · EWB ${d.ewbNo || "-"}`, d, null);
    return this.edocView(type, id);
  }

  async generateIrn(type: string, id: number) {
    const { json, docNo } = this.docJson(type, id);
    const ex = this.edoc(type, id);
    if (ex?.irn_status === "ACT") throw new ErpError("IRN already generated for this document (IRP error 2150: duplicate IRN)");
    if (ex?.irn_status === "CNL") throw new ErpError("The IRN for this document number was cancelled; the same number cannot be reported again — issue a new document");
    try {
      this.validate(json);
      const r = this.cfg().gspMode === "LIVE" ? await this.live("/eicore/v1.03/Invoice", json) : this.simulateIrn(json);
      run(`INSERT INTO edocs (doc_type, doc_id, doc_no, irn, ack_no, ack_dt, signed_qr, irn_status, irn_at, mode) VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(doc_type, doc_id) DO UPDATE SET irn=excluded.irn, ack_no=excluded.ack_no, ack_dt=excluded.ack_dt, signed_qr=excluded.signed_qr, irn_status='ACT', irn_at=excluded.irn_at, mode=excluded.mode`,
        type, id, docNo, r.Irn, String(r.AckNo), r.AckDt, r.SignedQRCode, "ACT", nowTs(), this.cfg().gspMode);
      this.markDoc(type, id, r.Irn, String(r.AckNo), null);
      this.log(type, docNo, "GENERATE_IRN", true, `IRN ${r.Irn.slice(0, 12)}… Ack ${r.AckNo}`, json.DocDtls, { Irn: r.Irn, AckNo: r.AckNo });
      return this.edocView(type, id);
    } catch (e: any) { this.log(type, docNo, "GENERATE_IRN", false, e.message, json.DocDtls, null); throw e; }
  }

  async cancelIrn(type: string, id: number, reason: string, remark: string) {
    const e = this.edocView(type, id);
    const docNo = this.edoc(type, id)?.doc_no ?? "";
    if (!e || e.irnStatus !== "ACT") throw new ErpError("No active IRN");
    if (e.ewbStatus === "ACT") throw new ErpError("Cancel the e-way bill first");
    if (!e.canCancelIrn) throw new ErpError("IRN can be cancelled only within 24 hours of generation — issue a credit note instead");
    if (!CANCEL_REASONS[reason]) throw new ErpError("Choose a cancellation reason");
    if (this.cfg().gspMode === "LIVE") await this.live("/eicore/v1.03/Invoice/Cancel", { Irn: e.irn, CnlRsn: reason, CnlRem: remark });
    sqlite.transaction(() => {
      run(`UPDATE edocs SET irn_status = 'CNL', cancel_reason = ?, cancel_at = ? WHERE doc_type = ? AND doc_id = ?`, `${CANCEL_REASONS[reason]}${remark ? " — " + remark : ""}`, nowTs(), type, id);
      // the document itself is void once its IRN is cancelled
      if (type === "INV") this.voidInvoice(id);
      else if (type === "CRN" || type === "DBN") this.voidNote(id);
      else if (type === "JWI") this.voidReturn(id);
    })();
    this.log(type, docNo, "CANCEL_IRN", true, CANCEL_REASONS[reason], { reason, remark }, null);
    return this.edocView(type, id);
  }

  /** E-way bill: from the IRN for invoices; standalone (sub-supply type Job Work) for job work challans */
  async generateEwb(type: string, id: number, t: { vehicleNo: string; transporter: string | null; distanceKm: number }) {
    if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(t.vehicleNo.replace(/\s/g, "").toUpperCase())) throw new ErpError("Vehicle no. format: e.g. MH12AB1234");
    if (!(t.distanceKm > 0) || t.distanceKm > 4000) throw new ErpError("Distance must be 1–4000 km");
    const veh = t.vehicleNo.replace(/\s/g, "").toUpperCase();
    let docNo = "", value = 0;
    if (type === "JWO") {
      const c = this.getChallan(id);
      docNo = c.challanNo; value = c.value;
      if (c.status === "CLOSED") throw new ErpError("Challan is closed");
    } else {
      const e = this.edocView(type, id);
      if (!e || e.irnStatus !== "ACT") throw new ErpError("Generate the IRN first — the e-way bill is created from the IRN");
      docNo = this.edoc(type, id)!.doc_no; value = this.docJson(type, id).total;
    }
    const ex = this.edocView(type, id);
    if (ex?.ewbStatus === "ACT") throw new ErpError("An active e-way bill already exists");
    const days = Math.max(1, Math.ceil(t.distanceKm / 200));
    const ewbDt = nowTs();
    const validTill = `${addDays(today(), days)} 23:59:00`;
    try {
      const r = this.cfg().gspMode === "LIVE"
        ? await this.live(type === "JWO" ? "/ewaybillapi/v1.03/ewayapi/GENEWAYBILL" : "/eiewb/v1.03/ewaybill", type === "JWO" ? { supplyType: "O", subSupplyType: "4", docType: "CHL", docNo, vehicleNo: veh, transDistance: String(t.distanceKm) } : { Irn: ex!.irn, Distance: t.distanceKm, TransMode: "1", VehNo: veh, VehType: "R", TransName: t.transporter })
        : { EwbNo: Number("1" + String(parseInt(crypto.createHash("md5").update(docNo + ewbDt).digest("hex").slice(0, 10), 16)).slice(0, 11).padStart(11, "0")), EwbDt: ewbDt, EwbValidTill: validTill };
      run(`INSERT INTO edocs (doc_type, doc_id, doc_no, ewb_no, ewb_dt, ewb_valid_till, ewb_status, ewb_at, mode) VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(doc_type, doc_id) DO UPDATE SET ewb_no=excluded.ewb_no, ewb_dt=excluded.ewb_dt, ewb_valid_till=excluded.ewb_valid_till, ewb_status='ACT', ewb_at=excluded.ewb_at`,
        type, id, docNo, String(r.EwbNo), r.EwbDt, r.EwbValidTill, "ACT", nowTs(), this.cfg().gspMode);
      if (type === "INV") run(`UPDATE invoices SET ewb_no = ?, vehicle_no = ?, transporter = COALESCE(?, transporter), distance_km = ? WHERE id = ?`, String(r.EwbNo), veh, t.transporter, t.distanceKm, id);
      if (type === "JWO") run(`UPDATE jwo_challans SET vehicle_no = ?, transporter = COALESCE(?, transporter), distance_km = ? WHERE id = ?`, veh, t.transporter, t.distanceKm, id);
      this.log(type, docNo, "GENERATE_EWB", true, `EWB ${r.EwbNo}, valid till ${r.EwbValidTill} (${days} day${days > 1 ? "s" : ""}, value ₹${value})`, { veh, distance: t.distanceKm }, r);
      return this.edocView(type, id);
    } catch (e: any) { this.log(type, docNo, "GENERATE_EWB", false, e.message, { veh }, null); throw e; }
  }
  async cancelEwb(type: string, id: number) {
    const e = this.edocView(type, id);
    if (!e || e.ewbStatus !== "ACT") throw new ErpError("No active e-way bill");
    if (!e.canCancelEwb) throw new ErpError("An e-way bill can be cancelled only within 24 hours of generation");
    if (this.cfg().gspMode === "LIVE") await this.live("/ewaybillapi/v1.03/ewayapi/CANEWB", { ewbNo: e.ewbNo, cancelRsnCode: 2 });
    run(`UPDATE edocs SET ewb_status = 'CNL' WHERE doc_type = ? AND doc_id = ?`, type, id);
    if (type === "INV") run(`UPDATE invoices SET ewb_no = NULL WHERE id = ?`, id);
    this.log(type, this.edoc(type, id)!.doc_no, "CANCEL_EWB", true, `EWB ${e.ewbNo} cancelled`, null, null);
    return this.edocView(type, id);
  }

  // ---------- Tally vouchers for notes and job work invoices ----------
  tallyVouchers(from: string, to: string) {
    const cfg = phase2.getSettings();
    const le = (ledger: string, amt: number) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${amt < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amt.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    const v: string[] = [];
    for (const n of this.listNotes().filter(n => n.status === "ACTIVE" && n.date >= from && n.date <= to).reverse()) {
      const s = n.typ === "CRN" ? 1 : -1; // credit note: customer credited (+), sales & output tax debited (−)
      const e = [le(n.customer.name, s * n.total), le(cfg.salesLedger, -s * n.taxable)];
      if (n.cgst) e.push(le("Output CGST", -s * n.cgst), le("Output SGST", -s * n.sgst));
      if (n.igst) e.push(le("Output IGST", -s * n.igst));
      if (n.roundOff) e.push(le("Round Off", -s * n.roundOff));
      const vt = n.typ === "CRN" ? "Credit Note" : "Debit Note";
      v.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${vt}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${n.date.replace(/-/g, "")}</DATE><VOUCHERTYPENAME>${vt}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(n.noteNo)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(n.customer.name)}</PARTYLEDGERNAME><PARTYGSTIN>${n.customer.gstin}</PARTYGSTIN><IRN>${n.edoc?.irn ?? ""}</IRN><NARRATION>${esc(`${n.reason} · against ${n.invNo} dt ${dmy(n.invDate)}`)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${e.join("")}</VOUCHER></TALLYMESSAGE>`);
    }
    for (const x of all<any>(`SELECT id FROM jwi_returns WHERE status = 'ACTIVE' AND date BETWEEN ? AND ? ORDER BY id`, from, to)) {
      const r = this.getReturn(x.id);
      const p = r.receipt.principal;
      const e = [le(p.name, -r.total), le("Job Work Charges", r.taxable)];
      if (r.cgst) e.push(le("Output CGST", r.cgst), le("Output SGST", r.sgst));
      if (r.igst) e.push(le("Output IGST", r.igst));
      if (r.roundOff) e.push(le("Round Off", r.roundOff));
      v.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${r.date.replace(/-/g, "")}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(r.invNo)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(p.name)}</PARTYLEDGERNAME><PARTYGSTIN>${p.gstin}</PARTYGSTIN><NARRATION>${esc(`Job work charges · ${r.receipt.process} · principal challan ${r.receipt.principalChallanNo} · our challan ${r.retNo}`)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${e.join("")}</VOUCHER></TALLYMESSAGE>`);
    }
    return v;
  }

  // ====================== DASHBOARDS ======================
  private stationIdeal() {
    const m: Record<string, number[]> = {};
    for (const r of phase3.routingsAll()) for (const op of r.ops) (m[op.station] ??= []).push(op.cycleSec);
    return Object.fromEntries(Object.keys(STATIONS).map(s => [s, m[s]?.length ? m[s].reduce((a, b) => a + b, 0) / m[s].length : 60]));
  }
  private dayStats(from: string, to: string) {
    // history (imported daily station counts) + live MES scans
    const rows = all<any>(`SELECT date, station, planned_min, units, good, ideal_sec FROM station_daily WHERE date BETWEEN ? AND ?`, from, to);
    const cyc = new Map<string, number>();
    for (const r of phase3.routingsAll()) for (const op of r.ops) cyc.set(`${r.itemId}|${op.code}`, op.cycleSec);
    const live = all<any>(`SELECT substr(l.ts,1,10) date, l.station, l.op_code, l.result, o.item_id FROM op_logs l JOIN production_orders o ON o.id = l.order_id WHERE substr(l.ts,1,10) BETWEEN ? AND ?`, from, to);
    const agg = new Map<string, any>();
    for (const l of live) {
      const k = `${l.date}|${l.station}`;
      const a = agg.get(k) ?? { date: l.date, station: l.station, planned_min: this.cfg().plannedMin, units: 0, good: 0, ideal_sec: 0, live: true };
      a.units++; if (l.result === "PASS") a.good++; a.ideal_sec += cyc.get(`${l.item_id}|${l.op_code}`) ?? 60; agg.set(k, a);
    }
    for (const a of Array.from(agg.values())) { a.ideal_sec = a.units ? a.ideal_sec / a.units : 60; rows.push(a); }
    const dt = all<any>(`SELECT date, station, SUM(minutes) m FROM downtime WHERE date BETWEEN ? AND ? GROUP BY date, station`, from, to);
    const dmap = new Map(dt.map(d => [`${d.date}|${d.station}`, d.m]));
    return rows.map(r => ({ ...r, downtime: dmap.get(`${r.date}|${r.station}`) ?? 0 }));
  }
  private oeeOf(rs: any[]) {
    const planned = rs.reduce((s, r) => s + r.planned_min, 0), down = rs.reduce((s, r) => s + Math.min(r.downtime, r.planned_min), 0);
    const runMin = planned - down, units = rs.reduce((s, r) => s + r.units, 0), good = rs.reduce((s, r) => s + r.good, 0);
    const idealMin = rs.reduce((s, r) => s + r.units * r.ideal_sec / 60, 0);
    const A = planned ? runMin / planned : 0, P = runMin ? Math.min(1, idealMin / runMin) : 0, Q = units ? good / units : 0;
    return { A: r2(A * 100), P: r2(P * 100), Q: r2(Q * 100), oee: r2(A * P * Q * 100), units, good, planned, downtime: down };
  }
  oee(from: string, to: string) {
    const t = today();
    const rows = this.dayStats(from, to).filter(r => r.date < t); // today's shift is still running
    const stations = Object.keys(STATIONS).map(s => ({ station: s, name: STATIONS[s], ...this.oeeOf(rows.filter(r => r.station === s)) }));
    const dates = Array.from(new Set(rows.map(r => r.date))).sort();
    const trend = dates.map(d => ({ date: d, ...this.oeeOf(rows.filter(r => r.date === d)) }));
    const pareto = all(`SELECT reason, SUM(minutes) minutes, COUNT(*) events FROM downtime WHERE date BETWEEN ? AND ? GROUP BY reason ORDER BY minutes DESC`, from, to);
    const live = this.dayStats(t, t);
    return { from, to, plant: this.oeeOf(rows), stations, trend, pareto, today: { units: live.reduce((s, r) => s + r.units, 0), good: live.reduce((s, r) => s + r.good, 0) } };
  }
  logDowntime(d: { date: string; station: string; minutes: number; reason: string; note: string }) {
    if (!STATIONS[d.station]) throw new ErpError("Unknown station");
    if (!DOWNTIME_REASONS.includes(d.reason)) throw new ErpError("Choose a reason");
    if (!(d.minutes > 0) || d.minutes > this.cfg().plannedMin) throw new ErpError(`Minutes must be 1–${this.cfg().plannedMin}`);
    if (d.date > today()) throw new ErpError("Date cannot be in the future");
    run(`INSERT INTO downtime (date, station, minutes, reason, note) VALUES (?,?,?,?,?)`, d.date, d.station, d.minutes, d.reason, d.note);
    return { ok: true };
  }
  listDowntime(from: string, to: string) { return all(`SELECT * FROM downtime WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC`, from, to); }
  fpy(from: string, to: string) {
    const items = all<any>(`SELECT s.item_id, i.code, i.name, i.product_line pl, COUNT(*) n, SUM(CASE WHEN s.eol_result = 'PASS' THEN 1 ELSE 0 END) pass FROM serials s JOIN items i ON i.id = s.item_id WHERE s.date BETWEEN ? AND ? GROUP BY s.item_id ORDER BY n DESC`, from, to);
    const rows = this.dayStats(from, to);
    const stations = Object.keys(STATIONS).map(s => { const r = rows.filter(x => x.station === s); const u = r.reduce((a, x) => a + x.units, 0), g = r.reduce((a, x) => a + x.good, 0); return { station: s, name: STATIONS[s], units: u, fpy: u ? r2(g / u * 100) : null }; });
    const rolled = stations.filter(s => s.fpy != null).reduce((p, s) => p * (s.fpy! / 100), 1);
    return { products: items.map(i => ({ code: i.code, name: i.name, productLine: i.pl, units: i.n, fpy: r2(i.pass / i.n * 100) })), stations, rty: r2(rolled * 100) };
  }
  orderBook() {
    const t = today();
    const lines = all<any>(`SELECT l.*, s.so_no, s.delivery_date, s.customer_id, p.name customer, i.code FROM so_lines l JOIN sales_orders s ON s.id = l.so_id JOIN parties p ON p.id = s.customer_id JOIN items i ON i.id = l.item_id WHERE s.status != 'CLOSED' AND l.qty > l.dispatched_qty`);
    const val = (l: any) => (l.qty - l.dispatched_qty) * l.rate;
    const byCust = new Map<string, number>();
    for (const l of lines) byCust.set(l.customer, (byCust.get(l.customer) ?? 0) + val(l));
    const bucket = (d: string) => { const n = daysBetween(t, d); return n < 0 ? "Overdue" : n <= 7 ? "Due ≤ 7 days" : n <= 30 ? "8–30 days" : "Later"; };
    const buckets = ["Overdue", "Due ≤ 7 days", "8–30 days", "Later"].map(b => ({ bucket: b, value: Math.round(lines.filter(l => bucket(l.delivery_date) === b).reduce((s, l) => s + val(l), 0)), lines: lines.filter(l => bucket(l.delivery_date) === b).length }));
    const inv = phase2.listInvoices().filter(i => i.status !== "CANCELLED");
    const weeks: { week: string; value: number }[] = [];
    for (let w = 7; w >= 0; w--) { const end = addDays(t, -7 * w), start = addDays(end, -6); weeks.push({ week: start, value: Math.round(inv.filter(i => i.date >= start && i.date <= end).reduce((s, i) => s + i.taxable, 0)) }); }
    return { total: Math.round(lines.reduce((s, l) => s + val(l), 0)), byCustomer: Array.from(byCust).map(([customer, value]) => ({ customer, value: Math.round(value) })).sort((a, b) => b.value - a.value),
      buckets, overdue: lines.filter(l => l.delivery_date < t).map(l => ({ soNo: l.so_no, customer: l.customer, code: l.code, pending: l.qty - l.dispatched_qty, value: Math.round(val(l)), due: l.delivery_date, daysLate: daysBetween(l.delivery_date, t) })),
      dispatchByWeek: weeks };
  }
  inventoryAgeing() {
    const t = today();
    const whs = new Map(storage.listWarehouses().map(w => [w.id, w.code]));
    const first = new Map(all<any>(`SELECT item_id, batch_no, MIN(date) d FROM stock_txns WHERE qty > 0 AND txn_type NOT IN ('JW_OUT','JW_IN','TRANSFER','INV_CANCEL') GROUP BY item_id, batch_no`).map(r => [`${r.item_id}|${r.batch_no}`, r.d]));
    const BK: string[] = ["0–30 days", "31–60 days", "61–90 days", "90+ days"];
    const rows = storage.stockByBatch().filter(b => whs.get(b.warehouseId) !== "WIP").map(b => {
      const it = storage.getItem(b.itemId)!;
      const cost = it.type === "RM" ? it.stdCost : storage.rolledCost(it.id);
      const since = first.get(`${b.itemId}|${b.batchNo}`) ?? t, age = daysBetween(since, t);
      return { code: it.code, name: it.name, type: it.type, wh: whs.get(b.warehouseId)!, batchNo: b.batchNo, qty: b.qty, value: Math.round(b.qty * cost), since, age, bucket: BK[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] };
    });
    const types = ["RM", "SFG", "FG"];
    const buckets: any[] = BK.map(b => ({ bucket: b, ...Object.fromEntries(types.map(ty => [ty, rows.filter(r => r.bucket === b && r.type === ty).reduce((s, r) => s + r.value, 0)])) }));
    return { total: rows.reduce((s, r) => s + r.value, 0), atJobWorkers: rows.filter(r => r.wh === "JW").reduce((s, r) => s + r.value, 0),
      buckets,
      oldest: rows.sort((a, b) => b.age - a.age || b.value - a.value).slice(0, 12) };
  }
  overview() {
    const t = today(), from = addDays(t, -14);
    const o = this.oee(from, t), f = this.fpy(addDays(t, -30), t), ob = this.orderBook(), ia = this.inventoryAgeing();
    const ch = this.listChallans();
    const fy = fyOf(t), per = this.itc04Periods(fy).find(p => p.from <= t && p.to >= t)!;
    const prev = this.itc04Periods(fy).filter(p => p.to < t).pop();
    const itcDue = prev && prev.due >= t ? prev : per;
    return { oee: o.plant, rty: f.rty, orderBook: ob.total, overdueLines: ob.overdue.length, inventory: ia.total, aged90: ia.buckets[3].RM + ia.buckets[3].SFG + ia.buckets[3].FG,
      atJobWorkers: ia.atJobWorkers, jwDue30: ch.filter(c => c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= 30).length, jwOverdue: ch.filter(c => c.status === "OVERDUE").length,
      itc04: { label: itcDue.label, due: itcDue.due, days: daysBetween(t, itcDue.due) }, irnPending: phase2.listInvoices().filter(i => i.status !== "CANCELLED" && !this.edoc("INV", i.id)).length };
  }

  // ====================== SEED ======================
  seed() {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS p4_config (id INTEGER PRIMARY KEY, gsp_mode TEXT NOT NULL, gsp_provider TEXT NOT NULL, gsp_env TEXT NOT NULL, aato_above_5cr INTEGER NOT NULL, aato_10cr INTEGER NOT NULL, planned_min INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jwo_challans (id INTEGER PRIMARY KEY AUTOINCREMENT, challan_no TEXT NOT NULL UNIQUE, date TEXT NOT NULL, jobworker_id INTEGER NOT NULL, process TEXT NOT NULL, expected_return TEXT, vehicle_no TEXT, transporter TEXT, distance_km INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS jwo_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, challan_id INTEGER NOT NULL, item_id INTEGER, description TEXT NOT NULL, hsn TEXT NOT NULL, uom TEXT NOT NULL, qty REAL NOT NULL, rate REAL NOT NULL, value REAL NOT NULL, kind TEXT NOT NULL, batch_no TEXT, gst_rate REAL NOT NULL, received_qty REAL NOT NULL DEFAULT 0, loss_qty REAL NOT NULL DEFAULT 0, deemed_qty REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS jwo_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, rec_no TEXT NOT NULL UNIQUE, date TEXT NOT NULL, challan_id INTEGER NOT NULL, jw_challan_no TEXT NOT NULL, jw_challan_date TEXT NOT NULL, lines TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS jwo_deemed (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, line_id INTEGER NOT NULL, challan_id INTEGER NOT NULL, qty REAL NOT NULL, taxable REAL NOT NULL, gst_rate REAL NOT NULL, tax REAL NOT NULL, interest_est REAL NOT NULL, supply_date TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jwi_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, rec_no TEXT NOT NULL UNIQUE, date TEXT NOT NULL, principal_id INTEGER NOT NULL, principal_challan_no TEXT NOT NULL, principal_challan_date TEXT NOT NULL, process TEXT NOT NULL, charge_rate REAL NOT NULL DEFAULT 0, lines TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jwi_returns (id INTEGER PRIMARY KEY AUTOINCREMENT, ret_no TEXT NOT NULL UNIQUE, inv_no TEXT NOT NULL UNIQUE, date TEXT NOT NULL, receipt_id INTEGER NOT NULL, lines TEXT NOT NULL, sac TEXT NOT NULL, charge_rate REAL NOT NULL, gst_rate REAL NOT NULL, taxable REAL NOT NULL, cgst REAL NOT NULL, sgst REAL NOT NULL, igst REAL NOT NULL, round_off REAL NOT NULL, total REAL NOT NULL, vehicle_no TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE');
      CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, note_no TEXT NOT NULL UNIQUE, typ TEXT NOT NULL, date TEXT NOT NULL, invoice_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, reason TEXT NOT NULL, kind TEXT NOT NULL, lines TEXT NOT NULL, taxable REAL NOT NULL, cgst REAL NOT NULL, sgst REAL NOT NULL, igst REAL NOT NULL, round_off REAL NOT NULL, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE');
      CREATE TABLE IF NOT EXISTS edocs (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_type TEXT NOT NULL, doc_id INTEGER NOT NULL, doc_no TEXT NOT NULL, irn TEXT, ack_no TEXT, ack_dt TEXT, signed_qr TEXT, irn_status TEXT, irn_at TEXT, cancel_reason TEXT, cancel_at TEXT, ewb_no TEXT, ewb_dt TEXT, ewb_valid_till TEXT, ewb_status TEXT, ewb_at TEXT, mode TEXT, UNIQUE(doc_type, doc_id));
      CREATE TABLE IF NOT EXISTS gsp_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, doc_type TEXT NOT NULL, doc_no TEXT NOT NULL, action TEXT NOT NULL, mode TEXT NOT NULL, ok INTEGER NOT NULL, message TEXT NOT NULL, request TEXT, response TEXT);
      CREATE TABLE IF NOT EXISTS downtime (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, station TEXT NOT NULL, minutes REAL NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS station_daily (date TEXT NOT NULL, station TEXT NOT NULL, planned_min REAL NOT NULL, units INTEGER NOT NULL, good INTEGER NOT NULL, ideal_sec REAL NOT NULL, PRIMARY KEY (date, station));
    `);
    if (!one(`SELECT id FROM p4_config WHERE id = 1`)) run(`INSERT INTO p4_config VALUES (1, 'SIMULATED', '', 'SANDBOX', 1, 0, 450)`);
    if (!storage.listWarehouses().find(w => w.code === "JW")) run(`INSERT INTO warehouses (code, name) VALUES ('JW', 'Stock at job workers')`);
    if (one(`SELECT id FROM jwo_challans LIMIT 1`)) return;

    // ---- job workers (demo; GSTINs are checksum-valid placeholders) ----
    const mk = (base: string) => base + gstinCheckChar(base);
    const sharp = phase2.createParty({ code: "J-SHARP", name: "Sharp Electroplaters", role: "JOBWORKER", gstin: mk("27AAKFS3317L1Z"), stateCode: "27", address: "Plot J-92, Bhosari MIDC", city: "Pune", pincode: "411026", distanceKm: 18 });
    const shree = phase2.createParty({ code: "J-SHREE", name: "Shree Heat Treatment Works", role: "JOBWORKER", gstin: mk("24AAPFS6650H1Z"), stateCode: "24", address: "Shed 41, Makarpura GIDC", city: "Vadodara", pincode: "390010", distanceKm: 590 });
    const tool = phase2.createParty({ code: "J-TOOLR", name: "Precitool Engineering", role: "JOBWORKER", gstin: mk("27AAGFP2219N1Z"), stateCode: "27", address: "Sector 10, PCNTDA, Bhosari", city: "Pune", pincode: "411026", distanceKm: 20 });
    const I = Object.fromEntries(storage.listItems().map(i => [i.code, i.id]));
    const rmWh = this.whId("RM");
    const avail = (code: string) => storage.stockByBatch().filter(b => b.itemId === I[code] && b.warehouseId === rmWh).reduce((s, b) => s + b.qty, 0);
    const send = (code: string, want: number) => Math.max(1, Math.min(want, Math.floor(avail(code) * 0.6)));
    // FY 2025-26 challan, never returned → overdue (deemed supply)
    const c0 = this.createChallan({ jobworkerId: shree.id, date: "2025-09-20", process: "Bright annealing of SS310 protection tubes", expectedReturn: "2025-10-05", vehicleNo: "MH12QW4471", transporter: "VRL Logistics", distanceKm: 590,
      lines: [{ itemId: I["RM-PTUBE"], qty: send("RM-PTUBE", 20), kind: "INPUT" }] });
    // FY 2026-27 H1
    const c1 = this.createChallan({ jobworkerId: sharp.id, date: "2026-08-14", process: "Electroless nickel plating of hex housings", expectedReturn: "2026-08-28", vehicleNo: "MH14GH2209", transporter: "Own vehicle", distanceKm: 18,
      lines: [{ itemId: I["RM-HSG-M20"], qty: send("RM-HSG-M20", 120), kind: "INPUT" }] });
    this.receiveBack({ challanId: c1.id, date: "2026-08-29", jwChallanNo: "SEP/118", jwChallanDate: "2026-08-29", lines: [{ lineId: c1.lines[0].id, qty: c1.lines[0].qty - 6, lossQty: 2 }] });
    const c2 = this.createChallan({ jobworkerId: shree.id, date: "2026-09-12", process: "Bright annealing of SS310 protection tubes", expectedReturn: "2026-09-30", vehicleNo: "MH12QW4471", transporter: "VRL Logistics", distanceKm: 590,
      lines: [{ itemId: I["RM-PTUBE"], qty: send("RM-PTUBE", 80), kind: "INPUT" }] });
    this.receiveBack({ challanId: c2.id, date: "2026-09-26", jwChallanNo: "SHT/26-27/233", jwChallanDate: "2026-09-25", lines: [{ lineId: c2.lines[0].id, qty: Math.floor(c2.lines[0].qty / 2), lossQty: 0 }] });
    this.createChallan({ jobworkerId: tool.id, date: "2026-09-18", process: "Refurbishment of crimping die set", expectedReturn: "2026-10-20", vehicleNo: "MH14GH2209", transporter: "Own vehicle", distanceKm: 20,
      lines: [{ itemId: null, description: "Crimping die set for 4-pin connector (tool)", hsn: "82073000", uom: "SET", qty: 1, rate: 48000, kind: "TOOL" },
              { itemId: null, description: "Calibration fixture plate, EGT bench (capital goods)", hsn: "90318000", uom: "NOS", qty: 1, rate: 65000, kind: "CAPITAL" }] });
    // FY 2026-27 H2 (open)
    this.createChallan({ jobworkerId: sharp.id, date: "2026-10-06", process: "Electroless nickel plating of mounting bosses", expectedReturn: "2026-10-16", vehicleNo: "MH14GH2209", transporter: "Own vehicle", distanceKm: 18,
      lines: [{ itemId: I["RM-HSG-M14"], qty: send("RM-HSG-M14", 60), kind: "INPUT" }] });
    // e-way bill for the inter-state challan (mandatory regardless of value)
    const simEwb = (id: number, dt: string, days: number) => run(`INSERT INTO edocs (doc_type, doc_id, doc_no, ewb_no, ewb_dt, ewb_valid_till, ewb_status, ewb_at, mode) SELECT 'JWO', id, challan_no, ?, ?, ?, 'ACT', ?, 'SIMULATED' FROM jwo_challans WHERE id = ?`,
      String(181000000000 + id * 7919), `${dt} 10:20:00`, `${addDays(dt, days)} 23:59:00`, `${dt} 10:20:00`, id);
    simEwb(c0.id, "2025-09-20", 3); simEwb(c2.id, "2026-09-12", 3);

    // ---- inward job work: Tau calibrates & EOL-tests customer-owned EGT probes ----
    const apex = phase2.listParties("CUSTOMER").find(p => p.code === "C-APEX")!;
    const r1 = this.createInward({ principalId: apex.id, date: "2026-09-29", principalChallanNo: "ACV/JW/26-27/0412", principalChallanDate: "2026-09-29", process: "Calibration & EOL testing of EGT probes", chargeRate: 85,
      lines: [{ description: "EGT probe assembly, customer-owned (ACV P/N 82-4471)", hsn: "90251990", uom: "NOS", qty: 200, value: 900 }] });
    this.returnInward({ receiptId: r1.id, date: "2026-10-07", sac: "998874", chargeRate: 85, gstRate: 18, vehicleNo: "MH14GH2209", lines: [{ idx: 0, qty: 118, scrapQty: 2 }] });

    // ---- a credit note (quality claim) against the first invoice ----
    const inv1 = phase2.listInvoices().slice(-1)[0];
    if (inv1) {
      const h = this.noteHeadroom(inv1.id)[0];
      if (h) this.createNote({ typ: "CRN", invoiceId: inv1.id, date: inv1.date > "2026-10-08" ? inv1.date : "2026-10-08", reason: "Quality claim", lines: [{ idx: 0, qty: Math.min(2, h.qty), rate: r2(h.rate * 0.1) }] });
    }

    // ---- 14 days of station history (demo) + downtime events ----
    let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ideal = this.stationIdeal(), t = today(), pm = this.cfg().plannedMin;
    const insD = sqlite.prepare(`INSERT INTO station_daily VALUES (?,?,?,?,?,?)`), insDt = sqlite.prepare(`INSERT INTO downtime (date, station, minutes, reason, note) VALUES (?,?,?,?,?)`);
    const notes: Record<string, string> = { "Breakdown": "Spindle / fixture fault", "Changeover / setup": "Model change", "Material shortage": "Waiting for kit", "No operator": "Absent", "Quality hold": "Awaiting QA release", "Planned maintenance": "PM schedule" };
    sqlite.transaction(() => {
      for (let k = 14; k >= 1; k--) {
        const d = addDays(t, -k);
        if (new Date(d + "T00:00:00Z").getUTCDay() === 0) continue; // Sunday off
        for (const s of Object.keys(STATIONS)) {
          let down = 0;
          const events = rnd() < 0.55 ? 1 + (rnd() < 0.3 ? 1 : 0) : 0;
          for (let e = 0; e < events; e++) {
            const reason = DOWNTIME_REASONS[Math.floor(rnd() ** 1.6 * DOWNTIME_REASONS.length)];
            const m = Math.round(10 + rnd() * (reason === "Breakdown" ? 70 : 35));
            down += m; insDt.run(d, s, m, reason, notes[reason]);
          }
          const perf = 0.72 + rnd() * 0.18, runMin = pm - down;
          const units = Math.floor(runMin * 60 * perf / ideal[s]);
          const good = Math.round(units * (s === "CAL" ? 0.955 + rnd() * 0.03 : 0.985 + rnd() * 0.013));
          insD.run(d, s, pm, units, good, ideal[s]);
        }
      }
    })();
  }
}

export const phase4 = new Phase4();
phase4.seed();
phase2.extraTally.push((from, to) => phase4.tallyVouchers(from, to));
