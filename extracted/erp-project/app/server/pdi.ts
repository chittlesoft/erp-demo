/**
 * Pre-Dispatch Inspection (PDI) — mirrors Tau Power format TPE/IMS/FR/78 Rev 01 (23.09.2026).
 * A PDI plan per part lists characteristics (spec + inspection method). Before a part with a plan
 * can be invoiced, an accepted PDI report must cover the dispatch quantity; the invoice then links to it.
 */
import { sqlite, storage, ErpError } from "./storage";
import { phase2 } from "./phase2";
import { phase3 } from "./phase3";

const all = <T = any>(q: string, ...p: any[]) => sqlite.prepare(q).all(...p) as T[];
const one = <T = any>(q: string, ...p: any[]) => sqlite.prepare(q).get(...p) as T | undefined;
const run = (q: string, ...p: any[]) => sqlite.prepare(q).run(...p);
const today = () => new Date().toISOString().slice(0, 10);

export type PdiChar = { sr: number; description: string; kind: "num" | "attr"; nominal: number | null; tolMinus: number | null; tolPlus: number | null; spec: string; method: string; unit: string };
export type PdiPlan = { itemId: number; drgRev: string; drgDate: string | null; refStandard: string; chars: PdiChar[] };
export type PdiReading = { sr: number; values: string[]; ok: boolean };

export const specText = (c: PdiChar) => {
  if (c.kind === "attr") return c.spec;
  if (c.nominal == null) return c.spec;
  const m = c.tolMinus ?? 0, p = c.tolPlus ?? 0;
  return m === p ? `${c.nominal}±${p}` : `${c.nominal} +${p}/-${m}`;
};
export function charOk(c: PdiChar, v: string) {
  const s = (v ?? "").trim().toUpperCase();
  if (!s) return false;
  if (c.kind === "attr") return ["OK", "GO", "PASS", "Y", "YES", "1"].includes(s);
  const n = Number(s); if (!Number.isFinite(n) || c.nominal == null) return false;
  return n >= c.nominal - (c.tolMinus ?? 0) - 1e-9 && n <= c.nominal + (c.tolPlus ?? 0) + 1e-9;
}

export class Pdi {
  ensure() {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS pdi_plans (item_id INTEGER PRIMARY KEY, drg_rev TEXT NOT NULL DEFAULT '00', drg_date TEXT, ref_standard TEXT NOT NULL DEFAULT '', chars TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS pdi_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, pdi_no TEXT NOT NULL UNIQUE, date TEXT NOT NULL, so_id INTEGER NOT NULL, so_line_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, qty REAL NOT NULL, sample INTEGER NOT NULL, drg_rev TEXT NOT NULL, drg_date TEXT, ref_standard TEXT NOT NULL,
        mtr INTEGER NOT NULL DEFAULT 0, chars TEXT NOT NULL, readings TEXT NOT NULL, result TEXT NOT NULL, inspector TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', invoice_id INTEGER);
    `);
  }
  getPlan(itemId: number): PdiPlan | null {
    const r = one<any>(`SELECT * FROM pdi_plans WHERE item_id = ?`, itemId);
    return r ? { itemId, drgRev: r.drg_rev, drgDate: r.drg_date, refStandard: r.ref_standard, chars: JSON.parse(r.chars) } : null;
  }
  listPlans() {
    return storage.listItems().filter(i => i.type === "FG").map(i => ({ itemId: i.id, code: i.code, name: i.name, customerPartNo: i.customerPartNo, plan: this.getPlan(i.id) }));
  }
  savePlan(d: PdiPlan) {
    if (storage.getItem(d.itemId)?.type !== "FG") throw new ErpError("PDI plans are for finished goods");
    d.chars.forEach((c, i) => {
      c.sr = i + 1;
      if (!c.description.trim()) throw new ErpError(`Row ${i + 1}: description required`);
      if (c.kind === "num" && (c.nominal == null || c.tolPlus == null || c.tolMinus == null)) throw new ErpError(`Row ${i + 1}: nominal and tolerances required`);
      if (c.kind === "attr" && !c.spec.trim()) throw new ErpError(`Row ${i + 1}: specification required`);
    });
    if (!d.chars.length) { run(`DELETE FROM pdi_plans WHERE item_id = ?`, d.itemId); return null; }
    run(`INSERT INTO pdi_plans (item_id, drg_rev, drg_date, ref_standard, chars) VALUES (?,?,?,?,?)
      ON CONFLICT(item_id) DO UPDATE SET drg_rev=excluded.drg_rev, drg_date=excluded.drg_date, ref_standard=excluded.ref_standard, chars=excluded.chars`,
      d.itemId, d.drgRev, d.drgDate, d.refStandard, JSON.stringify(d.chars));
    return this.getPlan(d.itemId);
  }

  /** qty already covered by accepted, not-yet-invoiced PDIs for an SO line */
  openQty(soLineId: number) { return one<any>(`SELECT COALESCE(SUM(qty),0) q FROM pdi_reports WHERE so_line_id = ? AND result = 'ACCEPT' AND invoice_id IS NULL`, soLineId)?.q ?? 0; }

  pending() {
    const fg = storage.listItems(); const stock = storage.onHand();
    const out: any[] = [];
    for (const so of phase2.listSOs()) for (const l of so.lines) {
      const pend = l.qty - l.dispatchedQty; if (pend <= 0) continue;
      const plan = this.getPlan(l.itemId); if (!plan) continue;
      const it = fg.find(i => i.id === l.itemId)!;
      const covered = this.openQty(l.id);
      out.push({ soId: so.id, soNo: so.soNo, soLineId: l.id, customerId: so.customerId, customer: phase2.getParty(so.customerId)?.name, itemId: it.id, itemCode: it.code, itemName: it.name,
        customerPartNo: it.customerPartNo, pending: pend, fgStock: stock.get(it.id) ?? 0, covered, toInspect: Math.max(0, pend - covered) });
    }
    return out;
  }

  create(d: { soLineId: number; qty: number; sample: number; mtr: boolean; inspector: string; note: string; readings: { sr: number; values: string[] }[] }) {
    const so = phase2.listSOs().find(s => s.lines.some(l => l.id === d.soLineId));
    if (!so) throw new ErpError("Sales order line not found");
    const line = so.lines.find(l => l.id === d.soLineId)!;
    const plan = this.getPlan(line.itemId);
    if (!plan) throw new ErpError("No PDI plan for this part — add one in Quality → Pre-dispatch → PDI plans");
    const pend = line.qty - line.dispatchedQty - this.openQty(line.id);
    if (d.qty <= 0 || d.qty > pend + 1e-9) throw new ErpError(`Inspection qty must be between 1 and ${pend} (pending, not yet inspected)`);
    if (!Number.isInteger(d.sample) || d.sample < 1 || d.sample > d.qty || d.sample > 10) throw new ErpError("Sampling no. must be between 1 and the inspection qty (max 10)");
    if (!d.inspector.trim()) throw new ErpError("Inspector name is required");
    const readings: PdiReading[] = plan.chars.map(c => {
      const vals = (d.readings.find(r => r.sr === c.sr)?.values ?? []).slice(0, d.sample).map(v => String(v ?? "").trim());
      if (vals.length < d.sample || vals.some(v => !v)) throw new ErpError(`${c.description}: enter all ${d.sample} readings`);
      return { sr: c.sr, values: vals, ok: vals.every(v => charOk(c, v)) };
    });
    const result = readings.every(r => r.ok) ? "ACCEPT" : "REJECT";
    const n = (one<any>(`SELECT COUNT(*) c FROM pdi_reports`)?.c ?? 0) + 1;
    const pdiNo = `PDI/${new Date().getFullYear() % 100}${String(new Date().getMonth() + 1).padStart(2, "0")}/${String(n).padStart(4, "0")}`;
    const info = run(`INSERT INTO pdi_reports (pdi_no, date, so_id, so_line_id, item_id, customer_id, qty, sample, drg_rev, drg_date, ref_standard, mtr, chars, readings, result, inspector, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, pdiNo, today(), so.id, line.id, line.itemId, so.customerId, d.qty, d.sample, plan.drgRev, plan.drgDate, plan.refStandard, d.mtr ? 1 : 0,
      JSON.stringify(plan.chars), JSON.stringify(readings), result, d.inspector.trim(), d.note.trim());
    if (result === "REJECT") {
      const bad = plan.chars.filter(c => !readings.find(r => r.sr === c.sr)!.ok).map(c => c.description).join(", ");
      phase3.createNcr({ source: "PDI", ref: `${pdiNo} / ${so.soNo}`, itemId: line.itemId, batchNo: null, serialNo: null, qty: d.qty, defect: `PDI reject — ${bad}`, disposition: "PENDING", status: "OPEN" });
    }
    return this.get(Number(info.lastInsertRowid));
  }

  get(id: number) {
    const r = one<any>(`SELECT * FROM pdi_reports WHERE id = ?`, id);
    if (!r) throw new ErpError("PDI report not found");
    const it = storage.getItem(r.item_id)!;
    const inv = r.invoice_id ? phase2.getInvoice(r.invoice_id) : null;
    const so = phase2.listSOs().find(s => s.id === r.so_id);
    return { id: r.id, pdiNo: r.pdi_no, date: r.date, soNo: so?.soNo, customer: phase2.getParty(r.customer_id)?.name, itemCode: it.code, itemName: it.name, customerPartNo: it.customerPartNo,
      qty: r.qty, sample: r.sample, drgRev: r.drg_rev, drgDate: r.drg_date, refStandard: r.ref_standard, mtr: !!r.mtr, chars: JSON.parse(r.chars) as PdiChar[], readings: JSON.parse(r.readings) as PdiReading[],
      result: r.result, inspector: r.inspector, note: r.note, invoiceId: r.invoice_id, invoiceNo: inv?.invNo ?? null, invoiceDate: inv?.date ?? null };
  }
  list() { return all<any>(`SELECT id FROM pdi_reports ORDER BY id DESC`).map(r => this.get(r.id)); }
  forInvoice(invoiceId: number) { return all<any>(`SELECT id FROM pdi_reports WHERE invoice_id = ? ORDER BY id`, invoiceId).map(r => this.get(r.id)); }

  /** Gate: every line whose part has a PDI plan needs accepted, un-invoiced PDI qty ≥ dispatch qty. */
  assert(soId: number, lines: { soLineId: number; qty: number }[]) {
    const so = phase2.listSOs().find(s => s.id === soId); if (!so) return;
    const short: string[] = [];
    for (const l of lines.filter(x => x.qty > 0)) {
      const sl = so.lines.find(x => x.id === l.soLineId); if (!sl || !this.getPlan(sl.itemId)) continue;
      const cov = this.openQty(sl.id);
      if (cov + 1e-9 < l.qty) short.push(`${storage.getItem(sl.itemId)?.code} (PDI covers ${cov} of ${l.qty})`);
    }
    if (short.length) throw new ErpError(`Dispatch blocked: pre-dispatch inspection pending for ${short.join(", ")}. Complete PDI in Quality → Pre-dispatch first.`);
  }
  link(soId: number, lines: { soLineId: number; qty: number }[], invoiceId: number) {
    for (const l of lines.filter(x => x.qty > 0)) {
      let need = l.qty;
      for (const r of all<any>(`SELECT id, qty FROM pdi_reports WHERE so_line_id = ? AND result='ACCEPT' AND invoice_id IS NULL ORDER BY id`, l.soLineId)) {
        if (need <= 1e-9) break;
        run(`UPDATE pdi_reports SET invoice_id = ? WHERE id = ?`, invoiceId, r.id); need -= r.qty;
      }
    }
  }
  status(soId: number) {
    const so = phase2.listSOs().find(s => s.id === soId); if (!so) return [];
    return so.lines.map(l => ({ soLineId: l.id, required: !!this.getPlan(l.itemId), covered: this.openQty(l.id) }));
  }

  seed() {
    this.ensure();
    if (one(`SELECT 1 FROM pdi_plans LIMIT 1`)) return;
    const I = Object.fromEntries(storage.listItems().map(i => [i.code, i]));
    const num = (sr: number, description: string, nominal: number, tol: number, method: string, unit = "mm"): PdiChar => ({ sr, description, kind: "num", nominal, tolMinus: tol, tolPlus: tol, spec: "", method, unit });
    const attr = (sr: number, description: string, spec: string, method: string): PdiChar => ({ sr, description, kind: "attr", nominal: null, tolMinus: null, tolPlus: null, spec, method, unit: "" });
    // Exactly as on Tau Power PDI reports (TPE/IMS/FR/78)
    if (I["TTT000002"]) this.savePlan({ itemId: I["TTT000002"].id, drgRev: "00", drgDate: "2026-10-06", refStandard: "-", chars: [num(1, "Probe Length", 70, 1, "Vernier Caliper"), num(2, "Harness Length", 400, 10, "Measuring Tape"), attr(3, "Mounting Fitment", "M14x1.5-6g", "Thread Gauge")] });
    if (I["TTT000004"]) this.savePlan({ itemId: I["TTT000004"].id, drgRev: "00", drgDate: "2026-10-06", refStandard: "-", chars: [num(1, "Probe Length", 50, 1, "Vernier Caliper"), num(2, "Harness Length", 300, 10, "Measuring Tape"), attr(3, "Mounting Fitment", "M12x1.25-6h", "Thread Gauge")] });
    // Readings exactly as on the attached PDI reports; invoice not yet raised
    const so = phase2.listSOs().find(s => s.customerPo === "OES/PO/26-27/0142");
    if (so) {
      const l2 = so.lines.find(l => l.itemId === I["TTT000002"]?.id), l4 = so.lines.find(l => l.itemId === I["TTT000004"]?.id);
      if (l2) this.create({ soLineId: l2.id, qty: 11, sample: 5, mtr: false, inspector: "PDI Inspector", note: "", readings: [{ sr: 1, values: ["70.02", "69.99", "70.03", "70.02", "70.01"] }, { sr: 2, values: ["401", "402", "400", "401", "400"] }, { sr: 3, values: ["OK", "OK", "OK", "OK", "OK"] }] });
      if (l4) this.create({ soLineId: l4.id, qty: 7, sample: 5, mtr: false, inspector: "PDI Inspector", note: "", readings: [{ sr: 1, values: ["50.02", "49.99", "50.01", "50.01", "50.01"] }, { sr: 2, values: ["302", "300", "300", "301", "300"] }, { sr: 3, values: ["OK", "OK", "OK", "OK", "OK"] }] });
      run(`UPDATE pdi_reports SET date = '2026-10-09'`);
    }
  }
}

export const pdi = new Pdi();
pdi.seed();
