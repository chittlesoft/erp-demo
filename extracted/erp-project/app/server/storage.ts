import {
  items, bomLines, warehouses, stockTxns, productionOrders, serials,
  type Item, type InsertItem, type BomLine, type InsertBomLine, type Warehouse,
  type StockTxn, type InsertStockTxn, type ProductionOrder, type InsertProductionOrder, type Serial,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, sql } from "drizzle-orm";

export const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);

const today = () => new Date().toISOString().slice(0, 10);
const PREFIX: Record<string, string> = { NOx: "NOX", EGTS: "EGT", UQS: "UQS", DeltaP: "DPS", Lambda: "LMB" };

export type StockRow = { itemId: number; warehouseId: number; batchNo: string | null; qty: number };
export type Requirement = { itemId: number; code: string; name: string; uom: string; required: number; available: number; shortage: number };

export class ErpError extends Error { status = 400; }

export class DatabaseStorage {
  // ---------- Items ----------
  listItems(): Item[] { return db.select().from(items).orderBy(items.code).all(); }
  getItem(id: number) { return db.select().from(items).where(eq(items.id, id)).get(); }
  createItem(d: InsertItem): Item { return db.insert(items).values(d).returning().get(); }
  updateItem(id: number, d: Partial<InsertItem>) { return db.update(items).set(d).where(eq(items.id, id)).returning().get(); }

  // ---------- BOM ----------
  listBom(parentId?: number): BomLine[] {
    const q = db.select().from(bomLines);
    return parentId ? q.where(eq(bomLines.parentItemId, parentId)).all() : q.all();
  }
  addBomLine(d: InsertBomLine): BomLine {
    if (d.parentItemId === d.componentItemId) throw new ErpError("An item cannot be its own component");
    if (this.isAncestor(d.componentItemId, d.parentItemId)) throw new ErpError("This would create a circular BOM");
    return db.insert(bomLines).values(d).returning().get();
  }
  deleteBomLine(id: number) { db.delete(bomLines).where(eq(bomLines.id, id)).run(); }
  private isAncestor(candidate: number, target: number): boolean {
    // true if target appears in candidate's BOM tree
    for (const l of this.listBom(candidate)) {
      if (l.componentItemId === target || this.isAncestor(l.componentItemId, target)) return true;
    }
    return false;
  }
  rolledCost(itemId: number): number {
    const lines = this.listBom(itemId);
    const item = this.getItem(itemId);
    if (!lines.length) return item?.stdCost ?? 0;
    return lines.reduce((s, l) => s + l.qty * (1 + l.scrapPct / 100) * this.rolledCost(l.componentItemId), 0);
  }

  // ---------- Warehouses & stock ----------
  listWarehouses(): Warehouse[] { return db.select().from(warehouses).all(); }
  listTxns(limit = 200): StockTxn[] { return db.select().from(stockTxns).orderBy(desc(stockTxns.id)).limit(limit).all(); }
  addTxn(d: InsertStockTxn): StockTxn { return db.insert(stockTxns).values(d).returning().get(); }
  stockByBatch(): StockRow[] {
    return sqlite.prepare(`SELECT item_id itemId, warehouse_id warehouseId, batch_no batchNo, SUM(qty) qty, MIN(id) firstId
      FROM stock_txns GROUP BY item_id, warehouse_id, batch_no HAVING SUM(qty) > 0.0001 ORDER BY firstId`).all() as StockRow[];
  }
  onHand(): Map<number, number> {
    const m = new Map<number, number>();
    const blocked = new Set(this.listWarehouses().filter(w => ["QC", "REJ", "JW"].includes(w.code)).map(w => w.id));
    for (const r of this.stockByBatch()) if (!blocked.has(r.warehouseId)) m.set(r.itemId, (m.get(r.itemId) ?? 0) + r.qty);
    return m;
  }
  transfer(itemId: number, batchNo: string | null, fromWh: number, toWh: number, qty: number, ref: string) {
    const bal = this.stockByBatch().find(r => r.itemId === itemId && r.warehouseId === fromWh && (r.batchNo ?? null) === (batchNo ?? null));
    if (!bal || bal.qty < qty - 1e-9) throw new ErpError("Insufficient stock in source location for this batch");
    const cost = this.getItem(itemId)?.stdCost ?? 0;
    sqlite.transaction(() => {
      this.addTxn({ date: today(), itemId, warehouseId: fromWh, qty: -qty, txnType: "TRANSFER", ref, batchNo, unitCost: cost });
      this.addTxn({ date: today(), itemId, warehouseId: toWh, qty, txnType: "TRANSFER", ref, batchNo, unitCost: cost });
    })();
  }

  // ---------- Production ----------
  listOrders(): ProductionOrder[] { return db.select().from(productionOrders).orderBy(desc(productionOrders.id)).all(); }
  getOrder(id: number) { return db.select().from(productionOrders).where(eq(productionOrders.id, id)).get(); }
  createOrder(d: InsertProductionOrder): ProductionOrder {
    if (!this.listBom(d.itemId).length) throw new ErpError("Item has no BOM — define one before planning production");
    const n = (db.select({ c: sql<number>`count(*)` }).from(productionOrders).get()?.c ?? 0) + 1;
    const orderNo = `PO-${new Date().getFullYear().toString().slice(2)}-${String(n).padStart(4, "0")}`;
    return db.insert(productionOrders).values({ ...d, orderNo }).returning().get();
  }
  orderRequirements(order: ProductionOrder): Requirement[] {
    const stock = this.onHand();
    return this.listBom(order.itemId).map(l => {
      const it = this.getItem(l.componentItemId)!;
      const required = roundQty(l.qty * (1 + l.scrapPct / 100) * order.qty, it.uom);
      const available = stock.get(it.id) ?? 0;
      return { itemId: it.id, code: it.code, name: it.name, uom: it.uom, required, available, shortage: Math.max(0, +(required - available).toFixed(3)) };
    });
  }
  startOrder(id: number): ProductionOrder {
    const order = this.getOrder(id);
    if (!order) throw new ErpError("Order not found");
    if (order.status !== "PLANNED") throw new ErpError("Only planned orders can be started");
    const reqs = this.orderRequirements(order);
    const short = reqs.filter(r => r.shortage > 0);
    if (short.length) throw new ErpError(`Material shortage: ${short.map(s => `${s.code} (${s.shortage} ${s.uom})`).join(", ")}`);
    const blocked = new Set(this.listWarehouses().filter(w => ["QC", "REJ", "JW"].includes(w.code)).map(w => w.id));
    const consumed: { itemId: number; batchNo: string | null; qty: number }[] = [];
    sqlite.transaction(() => {
      const batches = this.stockByBatch().filter(b => !blocked.has(b.warehouseId));
      for (const r of reqs) {
        let need = r.required;
        const cost = this.getItem(r.itemId)?.stdCost ?? 0;
        for (const b of batches.filter(b => b.itemId === r.itemId)) { // FIFO
          if (need <= 1e-9) break;
          const take = Math.min(need, b.qty);
          this.addTxn({ date: today(), itemId: r.itemId, warehouseId: b.warehouseId, qty: -take, txnType: "ISSUE", ref: order.orderNo, batchNo: b.batchNo, unitCost: cost });
          consumed.push({ itemId: r.itemId, batchNo: b.batchNo, qty: +take.toFixed(3) });
          need -= take;
        }
      }
      db.update(productionOrders).set({ status: "IN_PROGRESS", consumedBatches: JSON.stringify(consumed) }).where(eq(productionOrders.id, id)).run();
    })();
    return this.getOrder(id)!;
  }
  completeOrder(id: number, goodQty: number, rejectQty: number): ProductionOrder {
    const order = this.getOrder(id);
    if (!order) throw new ErpError("Order not found");
    if (order.status !== "IN_PROGRESS") throw new ErpError("Only in-progress orders can be completed");
    const hasWip = !!sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='wip_units'`).get();
    if (hasWip && (sqlite.prepare(`SELECT COUNT(*) c FROM wip_units WHERE order_id = ?`).get(id) as any).c > 0) throw new ErpError("This order is on the shop floor — close it from Shop Floor once all units are finished");
    if (goodQty + rejectQty !== order.qty) throw new ErpError(`Good + rejected must equal order quantity (${order.qty})`);
    const item = this.getItem(order.itemId)!;
    sqlite.transaction(() => {
      if (goodQty > 0) this.addTxn({ date: today(), itemId: item.id, warehouseId: order.warehouseId, qty: goodQty, txnType: "PROD_OUT", ref: order.orderNo, batchNo: order.orderNo, unitCost: this.rolledCost(item.id) });
      if (item.tracking === "serial") this.generateSerials(order, item, goodQty, rejectQty);
      db.update(productionOrders).set({ status: "COMPLETED", goodQty, rejectQty }).where(eq(productionOrders.id, id)).run();
    })();
    return this.getOrder(id)!;
  }
  private generateSerials(order: ProductionOrder, item: Item, good: number, bad: number, date = today()) {
    const ym = date.slice(2, 4) + date.slice(5, 7);
    const prefix = `${PREFIX[item.productLine ?? ""] ?? "FG"}-${ym}-`;
    const hasWip = !!sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='wip_units'`).get();
    let seq = (sqlite.prepare(`SELECT MAX(n) m FROM (SELECT CAST(substr(serial_no, ?) AS INTEGER) n FROM serials WHERE serial_no LIKE ?${hasWip ? " UNION ALL SELECT CAST(substr(serial_no, ?) AS INTEGER) n FROM wip_units WHERE serial_no LIKE ?" : ""})`)
      .get(...(hasWip ? [prefix.length + 1, prefix + "%", prefix.length + 1, prefix + "%"] : [prefix.length + 1, prefix + "%"])) as any).m ?? 0;
    const results = [...Array(good).fill("PASS"), ...Array(bad).fill("FAIL")];
    for (const res of results) {
      seq++;
      db.insert(serials).values({
        serialNo: prefix + String(seq).padStart(5, "0"), itemId: item.id, productionOrderId: order.id,
        eolResult: res, eolData: JSON.stringify(simulatedEol(item.productLine, res === "PASS")), date, status: res === "PASS" ? "IN_STOCK" : "REJECTED",
      }).run();
    }
  }
  listSerials(limit = 300): Serial[] { return db.select().from(serials).orderBy(desc(serials.id)).limit(limit).all(); }
  traceSerial(serialNo: string) {
    const s = db.select().from(serials).where(eq(serials.serialNo, serialNo.trim().toUpperCase())).get();
    if (!s) return undefined;
    const order = this.getOrder(s.productionOrderId)!;
    const comps = (JSON.parse(order.consumedBatches) as { itemId: number; batchNo: string | null; qty: number }[])
      .map(c => ({ ...c, item: this.getItem(c.itemId) }));
    const inv = s.invoiceId ? (sqlite.prepare(`SELECT i.inv_no invNo, i.date, p.name customer FROM invoices i JOIN parties p ON p.id = i.customer_id WHERE i.id = ?`).get(s.invoiceId) as any) : null;
    return { serial: s, item: this.getItem(s.itemId), order, components: comps, dispatch: inv };
  }
  traceBatch(batchNo: string) {
    // reverse trace: which orders/serials consumed this raw-material batch
    const orders = this.listOrders().filter(o => (JSON.parse(o.consumedBatches) as any[]).some(c => c.batchNo === batchNo.trim()));
    return orders.map(o => ({ order: o, item: this.getItem(o.itemId), serials: db.select().from(serials).where(eq(serials.productionOrderId, o.id)).all() }));
  }

  // ---------- MRP (multi-level, netted against stock) ----------
  mrp(): Requirement[] {
    const stock = this.onHand();
    const free = new Map(stock);
    const gross = new Map<number, number>();
    const explode = (itemId: number, qty: number) => {
      for (const l of this.listBom(itemId)) {
        const need = roundQty(l.qty * (1 + l.scrapPct / 100) * qty, this.getItem(l.componentItemId)!.uom);
        gross.set(l.componentItemId, (gross.get(l.componentItemId) ?? 0) + need);
        const avail = free.get(l.componentItemId) ?? 0;
        const used = Math.min(avail, need);
        free.set(l.componentItemId, avail - used);
        const net = need - used;
        if (net > 0 && this.listBom(l.componentItemId).length) explode(l.componentItemId, net);
      }
    };
    for (const o of this.listOrders().filter(o => o.status === "PLANNED")) explode(o.itemId, o.qty);
    return Array.from(gross.entries()).map(([itemId, required]) => {
      const it = this.getItem(itemId)!;
      const available = stock.get(itemId) ?? 0;
      return { itemId, code: it.code, name: it.name, uom: it.uom, required: +required.toFixed(3), available: +available.toFixed(3), shortage: Math.max(0, +(required - available).toFixed(3)) };
    }).sort((a, b) => b.shortage - a.shortage);
  }

  // ---------- Dashboard ----------
  dashboard() {
    const all = this.listItems();
    const stock = this.onHand();
    const stockValue = all.reduce((s, i) => s + (stock.get(i.id) ?? 0) * (i.type === "FG" || i.type === "SFG" ? this.rolledCost(i.id) : i.stdCost), 0);
    const lowStock = all.filter(i => i.reorderLevel > 0 && (stock.get(i.id) ?? 0) < i.reorderLevel)
      .map(i => ({ id: i.id, code: i.code, name: i.name, uom: i.uom, onHand: stock.get(i.id) ?? 0, reorderLevel: i.reorderLevel }));
    const orders = this.listOrders();
    const done = orders.filter(o => o.status === "COMPLETED");
    const good = done.reduce((s, o) => s + o.goodQty, 0);
    const rej = done.reduce((s, o) => s + o.rejectQty, 0);
    const byLine: Record<string, { line: string; good: number; reject: number }> = {};
    for (const o of done) {
      const line = this.getItem(o.itemId)?.productLine ?? "Other";
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

  // ---------- Seed ----------
  seed() {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL, product_line TEXT, hsn TEXT NOT NULL, gst_rate REAL NOT NULL DEFAULT 18, uom TEXT NOT NULL DEFAULT 'NOS', tracking TEXT NOT NULL DEFAULT 'none', reorder_level REAL NOT NULL DEFAULT 0, std_cost REAL NOT NULL DEFAULT 0, customer_part_no TEXT, specs TEXT);
      CREATE TABLE IF NOT EXISTS bom_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_item_id INTEGER NOT NULL, component_item_id INTEGER NOT NULL, qty REAL NOT NULL, scrap_pct REAL NOT NULL DEFAULT 0, version TEXT NOT NULL DEFAULT 'A');
      CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS stock_txns (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, item_id INTEGER NOT NULL, warehouse_id INTEGER NOT NULL, qty REAL NOT NULL, txn_type TEXT NOT NULL, ref TEXT, batch_no TEXT, unit_cost REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS production_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT NOT NULL UNIQUE, item_id INTEGER NOT NULL, qty REAL NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PLANNED', warehouse_id INTEGER NOT NULL, good_qty REAL NOT NULL DEFAULT 0, reject_qty REAL NOT NULL DEFAULT 0, consumed_batches TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS serials (id INTEGER PRIMARY KEY AUTOINCREMENT, serial_no TEXT NOT NULL UNIQUE, item_id INTEGER NOT NULL, production_order_id INTEGER NOT NULL, eol_result TEXT NOT NULL, eol_data TEXT NOT NULL DEFAULT '{}', date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'IN_STOCK', invoice_id INTEGER);
    `);
    if (this.listItems().length) return;
    const wh = ["RM|Raw Material Stores", "WIP|Shop Floor WIP", "FG|Finished Goods Stores", "QC|QC Quarantine"]
      .map(s => db.insert(warehouses).values({ code: s.split("|")[0], name: s.split("|")[1] }).returning().get());
    const W = Object.fromEntries(wh.map(w => [w.code, w.id]));
    type S = [string, string, string, string | null, string, string, string, number, number, string | null];
    const seedItems: S[] = [
      ["RM-ZR-NOX", "NOx zirconia multi-chamber sensing element", "RM", null, "90279000", "NOS", "batch", 200, 2850, null],
      ["RM-ZR-LMB2", "Planar ZrO2 2-state lambda element with heater", "RM", null, "90279000", "NOS", "batch", 300, 380, null],
      ["RM-ZR-LMBW", "Planar ZrO2 wideband element, dual pump cell", "RM", null, "90279000", "NOS", "batch", 200, 690, null],
      ["RM-TC-K", "K-type MI thermocouple, 3 mm sheath", "RM", null, "90259000", "NOS", "batch", 300, 420, null],
      ["RM-NTC-HT", "High-temp PTC/NTC thermistor element", "RM", null, "85334030", "NOS", "batch", 300, 160, null],
      ["RM-PZ-MEMS", "MEMS differential pressure die", "RM", null, "90269000", "NOS", "batch", 250, 310, null],
      ["RM-US-TRX", "Ultrasonic transducer for urea concentration", "RM", null, "90279000", "NOS", "batch", 150, 780, null],
      ["RM-PCB-NOX", "NOx sensor control unit PCB (CAN J1939)", "RM", null, "85340000", "NOS", "batch", 200, 1650, null],
      ["RM-PCB-SENT", "ASIC signal-conditioning PCB, SENT output", "RM", null, "85340000", "NOS", "batch", 300, 260, null],
      ["RM-PCB-EGT", "EGT module PCB, cold-junction compensation", "RM", null, "85340000", "NOS", "batch", 300, 340, null],
      ["RM-PCB-UQS", "UQS controller PCB, anti-bubble algorithm", "RM", null, "85340000", "NOS", "batch", 150, 520, null],
      ["RM-HSG-M20", "SS hex housing M20x1.5", "RM", null, "73269099", "NOS", "batch", 600, 95, null],
      ["RM-HSG-M14", "SS hex mounting boss M14x1.5-6g", "RM", null, "73269099", "NOS", "batch", 300, 62, null],
      ["RM-HSG-M12", "SS hex mounting boss M12x1.25-6h", "RM", null, "73269099", "NOS", "batch", 300, 55, null],
      ["RM-HSG-PA66", "PA66-GF30 moulded housing", "RM", null, "39269099", "NOS", "batch", 400, 38, null],
      ["RM-PROT-D1", "Lambda protector D1 (fast response)", "RM", null, "73269099", "NOS", "batch", 300, 64, null],
      ["RM-PROT-D3", "Lambda protector D3 (enhanced protection)", "RM", null, "73269099", "NOS", "batch", 300, 78, null],
      ["RM-PTUBE", "Double-wall protection tube, SS310", "RM", null, "73269099", "NOS", "batch", 300, 72, null],
      ["RM-CBL-HT", "High-temp PTFE cable, 4-core", "RM", null, "85444999", "MTR", "batch", 800, 48, null],
      ["RM-CON-4P", "4-pin sealed connector", "RM", null, "85369090", "NOS", "batch", 600, 54, null],
      ["RM-CON-5P", "5-pin sealed connector", "RM", null, "85369090", "NOS", "batch", 250, 66, null],
      ["RM-CON-6P", "6-pin sealed connector (wideband)", "RM", null, "85369090", "NOS", "batch", 200, 82, null],
      ["RM-GRM-SIL", "Silicone grommet", "RM", null, "40169390", "NOS", "none", 800, 6, null],
      ["SFG-NOX-PRB", "NOx probe sub-assembly", "SFG", "NOx", "90279000", "NOS", "batch", 0, 0, null],
      ["FG-NOX-BS6", "NOx Sensor, BS VI / Euro VI / China VI", "FG", "NOx", "90271000", "NOS", "serial", 50, 0, "CPN-NX-2410"],
      ["FG-EGTS-TC", "EGTS, thermocouple, -40 to 1000 °C", "FG", "EGTS", "90251990", "NOS", "serial", 100, 0, "CPN-ET-0800"],
      ["FG-EGTS-NTC", "EGTS, PTC/NTC type", "FG", "EGTS", "90251990", "NOS", "serial", 60, 0, "CPN-ET-0450"],
      ["FG-UQS-US", "Urea Quality Sensor, ultrasonic", "FG", "UQS", "90278990", "NOS", "serial", 40, 0, "CPN-UQ-0101"],
      ["FG-DPS-SENT", "Delta P Sensor, MEMS, SENT output", "FG", "DeltaP", "90262000", "NOS", "serial", 80, 0, "CPN-DP-0100"],
      ["FG-LD6000-D1", "LD6000 planar 2-state lambda, protector D1", "FG", "Lambda", "90271000", "NOS", "serial", 60, 0, "CPN-LB-6001"],
      ["FG-LD6000-D3", "LD6000 planar 2-state lambda, protector D3", "FG", "Lambda", "90271000", "NOS", "serial", 40, 0, "CPN-LB-6003"],
      ["FG-LD6549", "LD6549 5-wire wideband lambda sensor", "FG", "Lambda", "90271000", "NOS", "serial", 50, 0, "CPN-LB-6549"],
      // From Tau Power sales invoice (Orient Engineering Solutions); customer part no. = TML part no.
      ["TTT000002", "EGTS (Analogue) - 108", "FG", "EGTS", "90271000", "NOS", "serial", 20, 0, "570615249301"],
      ["TTT000004", "EGT Sensor", "FG", "EGTS", "90251990", "NOS", "serial", 20, 0, "570615249303"],
    ];

    const I: Record<string, number> = {};
    const SPECS: Record<string, string> = {
      "FG-NOX-BS6": "Real-time NOx data to ECU; compliant with BS VI, Euro VI, China VI",
      "FG-EGTS-TC": "Thermocouple; -40 to 1000 °C; cold-junction compensation; 1–4 probes; DPF regeneration / SCR efficiency",
      "FG-EGTS-NTC": "PTC/NTC element; -40 to 1000 °C range family; 1–4 probes configurable",
      "FG-UQS-US": "Ultrasonic urea concentration & level; anti-bubble technology",
      "FG-DPS-SENT": "MEMS bridge + ASIC; SENT output; temperature compensated; DPF monitoring",
      "FG-LD6000-D1": "Planar 2-state λ=1, Nernst; heater 13 V; protector D1 response as low as 60 ms; gasoline/diesel/E85; OBD",
      "FG-LD6000-D3": "Planar 2-state λ=1, Nernst; heater 13 V; protector D3 enhanced protection, response up to 250 ms; OBD",
      "TTT000002": "Analogue EGT sensor; probe length 70 ±1 mm; harness 400 ±10 mm; mounting M14x1.5-6g; TML part 570615249301",
      "TTT000004": "EGT sensor; probe length 50 ±1 mm; harness 300 ±10 mm; mounting M12x1.25-6h; TML part 570615249303",
      "FG-LD6549": "5-wire wideband, dual limiting-current pump cells; heater 7.5 V; λ 0.65 to ∞; for CJ125 / CJ135",
    };
    for (const s of seedItems) I[s[0]] = this.createItem({ code: s[0], name: s[1], type: s[2], productLine: s[3], hsn: s[4], uom: s[5], tracking: s[6], reorderLevel: s[7], stdCost: s[8], customerPartNo: s[9], gstRate: 18, specs: SPECS[s[0]] ?? null }).id;
    const bom: [string, string, number, number][] = [
      ["SFG-NOX-PRB", "RM-ZR-NOX", 1, 2], ["SFG-NOX-PRB", "RM-HSG-M20", 1, 0], ["SFG-NOX-PRB", "RM-PTUBE", 1, 0],
      ["FG-NOX-BS6", "SFG-NOX-PRB", 1, 0], ["FG-NOX-BS6", "RM-PCB-NOX", 1, 0], ["FG-NOX-BS6", "RM-CBL-HT", 1.2, 3], ["FG-NOX-BS6", "RM-CON-5P", 1, 0], ["FG-NOX-BS6", "RM-GRM-SIL", 1, 0],
      ["FG-EGTS-TC", "RM-TC-K", 1, 1], ["FG-EGTS-TC", "RM-PCB-EGT", 1, 0], ["FG-EGTS-TC", "RM-HSG-M20", 1, 0], ["FG-EGTS-TC", "RM-CBL-HT", 0.8, 3], ["FG-EGTS-TC", "RM-CON-4P", 1, 0], ["FG-EGTS-TC", "RM-GRM-SIL", 1, 0],
      ["FG-EGTS-NTC", "RM-NTC-HT", 1, 1], ["FG-EGTS-NTC", "RM-HSG-M20", 1, 0], ["FG-EGTS-NTC", "RM-CBL-HT", 0.45, 3], ["FG-EGTS-NTC", "RM-CON-4P", 1, 0], ["FG-EGTS-NTC", "RM-GRM-SIL", 1, 0],
      ["FG-UQS-US", "RM-US-TRX", 1, 1], ["FG-UQS-US", "RM-PCB-UQS", 1, 0], ["FG-UQS-US", "RM-HSG-PA66", 1, 0], ["FG-UQS-US", "RM-CON-4P", 1, 0],
      ["FG-DPS-SENT", "RM-PZ-MEMS", 1, 2], ["FG-DPS-SENT", "RM-PCB-SENT", 1, 0], ["FG-DPS-SENT", "RM-HSG-PA66", 1, 0], ["FG-DPS-SENT", "RM-CON-4P", 1, 0],
      ["FG-LD6000-D1", "RM-ZR-LMB2", 1, 2], ["FG-LD6000-D1", "RM-HSG-M20", 1, 0], ["FG-LD6000-D1", "RM-PROT-D1", 1, 0], ["FG-LD6000-D1", "RM-CBL-HT", 0.6, 3], ["FG-LD6000-D1", "RM-CON-4P", 1, 0], ["FG-LD6000-D1", "RM-GRM-SIL", 1, 0],
      ["FG-LD6000-D3", "RM-ZR-LMB2", 1, 2], ["FG-LD6000-D3", "RM-HSG-M20", 1, 0], ["FG-LD6000-D3", "RM-PROT-D3", 1, 0], ["FG-LD6000-D3", "RM-CBL-HT", 0.6, 3], ["FG-LD6000-D3", "RM-CON-4P", 1, 0], ["FG-LD6000-D3", "RM-GRM-SIL", 1, 0],
      ["FG-LD6549", "RM-ZR-LMBW", 1, 2], ["FG-LD6549", "RM-HSG-M20", 1, 0], ["FG-LD6549", "RM-PTUBE", 1, 0], ["FG-LD6549", "RM-CBL-HT", 0.6, 3], ["FG-LD6549", "RM-CON-6P", 1, 0], ["FG-LD6549", "RM-GRM-SIL", 1, 0],
      ["TTT000002", "RM-TC-K", 1, 1], ["TTT000002", "RM-HSG-M14", 1, 0], ["TTT000002", "RM-CBL-HT", 0.4, 3], ["TTT000002", "RM-CON-4P", 1, 0], ["TTT000002", "RM-GRM-SIL", 1, 0],
      ["TTT000004", "RM-TC-K", 1, 1], ["TTT000004", "RM-HSG-M12", 1, 0], ["TTT000004", "RM-CBL-HT", 0.3, 3], ["TTT000004", "RM-CON-4P", 1, 0], ["TTT000004", "RM-GRM-SIL", 1, 0],
    ];

    for (const [p, c, q, s] of bom) this.addBomLine({ parentItemId: I[p], componentItemId: I[c], qty: q, scrapPct: s, version: "A" });
    const receipts: [string, number, string][] = [
      ["RM-ZR-NOX", 120, "ZN-2609-014"], ["RM-ZR-NOX", 160, "ZN-2610-003"], ["RM-ZR-LMB2", 520, "ZL-2609-021"], ["RM-ZR-LMBW", 260, "ZW-2609-006"],
      ["RM-TC-K", 650, "TC-2609-110"], ["RM-NTC-HT", 400, "NT-2609-031"], ["RM-PZ-MEMS", 180, "PZ-2609-007"], ["RM-US-TRX", 210, "US-2609-002"],
      ["RM-PCB-NOX", 240, "PN-2609-031"], ["RM-PCB-SENT", 420, "PS-2609-044"], ["RM-PCB-EGT", 700, "PE-2609-018"], ["RM-PCB-UQS", 200, "PU-2609-005"],
      ["RM-HSG-M20", 2200, "HS-2609-090"], ["RM-HSG-M14", 400, "H14-2609-003"], ["RM-HSG-M12", 400, "H12-2609-002"], ["RM-HSG-PA66", 1100, "HP-2609-012"], ["RM-PROT-D1", 420, "D1-2609-011"], ["RM-PROT-D3", 360, "D3-2609-004"], ["RM-PTUBE", 600, "PT-2609-055"],
      ["RM-CBL-HT", 1500, "CB-2609-008"], ["RM-CON-4P", 2000, "C4-2609-017"], ["RM-CON-5P", 320, "C5-2609-009"], ["RM-CON-6P", 260, "C6-2609-003"], ["RM-GRM-SIL", 3000, null as any],
    ];

    for (const [code, q, b] of receipts) this.addTxn({ date: "2026-09-22", itemId: I[code], warehouseId: W.RM, qty: q, txnType: "RECEIPT", ref: "GRN-OPENING", batchNo: b, unitCost: this.getItem(I[code])!.stdCost });
    this.addTxn({ date: "2026-10-05", itemId: I["RM-TC-K"], warehouseId: W.QC, qty: 60, txnType: "RECEIPT", ref: "GRN-2610-004", batchNo: "TC-2610-118", unitCost: 420 });
    // history: completed orders
    const hist: [string, number, number, number, string][] = [
      ["SFG-NOX-PRB", 60, 58, 2, "2026-09-25"], ["FG-NOX-BS6", 50, 47, 3, "2026-09-28"], ["FG-EGTS-TC", 200, 196, 4, "2026-09-29"], ["FG-EGTS-NTC", 60, 59, 1, "2026-09-30"],
      ["FG-LD6000-D1", 120, 116, 4, "2026-10-01"], ["FG-LD6000-D3", 60, 58, 2, "2026-10-02"], ["FG-LD6549", 70, 66, 4, "2026-10-02"], ["FG-DPS-SENT", 80, 79, 1, "2026-10-03"], ["FG-UQS-US", 40, 37, 3, "2026-10-06"],
      ["TTT000002", 30, 29, 1, "2026-10-07"], ["TTT000004", 20, 20, 0, "2026-10-07"],
    ];

    for (const [code, q, g, r, d] of hist) {
      const o = this.createOrder({ itemId: I[code], qty: q, dueDate: d, warehouseId: code.startsWith("SFG") ? W.WIP : W.FG });
      this.startOrder(o.id);
      sqlite.transaction(() => {
        const it = this.getItem(I[code])!;
        if (g) this.addTxn({ date: d, itemId: it.id, warehouseId: o.warehouseId, qty: g, txnType: "PROD_OUT", ref: o.orderNo, batchNo: o.orderNo, unitCost: this.rolledCost(it.id) });
        if (it.tracking === "serial") this.generateSerials(o, it, g, r, d);
        db.update(productionOrders).set({ status: "COMPLETED", goodQty: g, rejectQty: r }).where(eq(productionOrders.id, o.id)).run();
      })();
    }
    const ip = this.createOrder({ itemId: I["FG-EGTS-TC"], qty: 150, dueDate: "2026-10-12", warehouseId: W.FG });
    this.startOrder(ip.id);
    this.createOrder({ itemId: I["FG-NOX-BS6"], qty: 100, dueDate: "2026-10-16", warehouseId: W.FG });
    this.createOrder({ itemId: I["FG-LD6549"], qty: 120, dueDate: "2026-10-20", warehouseId: W.FG });
    this.createOrder({ itemId: I["FG-DPS-SENT"], qty: 60, dueDate: "2026-10-22", warehouseId: W.FG });
    db.update(stockTxns).set({ date: "2026-10-08" }).where(sql`date > '2026-10-08'`).run();
  }
}

const roundQty = (q: number, uom: string) => (uom === "NOS" ? Math.ceil(q - 1e-9) : +q.toFixed(3));

// Prototype only: realistic placeholder EOL values. Production version imports real test-bench data.
function simulatedEol(line: string | null, pass: boolean): Record<string, string> {
  const r = (a: number, b: number, d = 2) => (a + Math.random() * (b - a)).toFixed(d);
  const bad = (ok: string, ng: string) => (pass ? ok : ng + " (out of spec)");
  switch (line) {
    case "NOx": return { "NOx offset (ppm)": bad(r(-8, 8, 1), r(14, 22, 1)), "O2 signal (%)": r(20.6, 21.2), "Heater current (A)": r(1.1, 1.4), "CAN comm": "OK" };
    case "EGTS": return { "Resistance @25°C (Ω)": bad(r(0.95, 1.05, 3), r(1.12, 1.25, 3)), "Accuracy @600°C (±°C)": r(1.2, 3.8, 1), "Insulation (MΩ)": r(110, 400, 0) };
    case "UQS": return { "Concentration (% AdBlue)": bad(r(31.8, 33.2, 1), r(28.0, 30.5, 1)), "Level accuracy (mm)": r(0.5, 2.5, 1), "Temp (°C)": r(24, 26, 1) };
    case "DeltaP": return { "Span error (% FS)": bad(r(0.2, 1.4), r(2.1, 3.5)), "Zero offset (kPa)": r(-0.3, 0.3), "Output @50 kPa (V)": r(2.48, 2.52, 3) };
    case "Lambda": return { "Lambda @ λ=1": bad(r(0.995, 1.005, 3), r(1.012, 1.03, 3)), "Ip pump current (mA)": r(-0.05, 0.05, 3), "Heater R (Ω)": r(3.0, 3.6) };
    default: return {};
  }
}

export const storage = new DatabaseStorage();
storage.seed();
