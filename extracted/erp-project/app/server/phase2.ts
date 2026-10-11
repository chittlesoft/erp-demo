import { eq, desc, inArray } from "drizzle-orm";
import {
  settings, parties, indents, purchaseOrders, poLines, grns, salesOrders, soLines, invoices, serials, items,
  type Settings, type Party, type InsertParty, type InvoiceLine, type Invoice, STATES,
} from "@shared/schema";
import { gstinCheckChar } from "@shared/schema";
import { db, sqlite, storage, ErpError } from "./storage";

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Indian financial year label, e.g. 2026-10-09 → "26-27" */
export const fyOf = (d: string) => { const y = +d.slice(2, 4), m = +d.slice(5, 7); return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const nextNo = (table: string, col: string, prefix: string) => {
  const c = (sqlite.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${col} LIKE ?`).get(prefix + "%") as any).c;
  return prefix + String(c + 1).padStart(4, "0");
};

/** Split GST into CGST+SGST (intra-state) or IGST (inter-state) */
export function gstSplit(taxable: number, rate: number, sellerState: string, pos: string) {
  const tax = r2(taxable * rate / 100);
  if (sellerState === pos) { const half = r2(tax / 2); return { cgst: half, sgst: r2(tax - half), igst: 0 }; }
  return { cgst: 0, sgst: 0, igst: tax };
}

export class Phase2 {
  // ---------- Settings & parties ----------
  getSettings(): Settings { return db.select().from(settings).where(eq(settings.id, 1)).get()!; }
  updateSettings(d: Partial<Settings>) { return db.update(settings).set(d).where(eq(settings.id, 1)).returning().get(); }
  listParties(role?: string): Party[] {
    const q = db.select().from(parties);
    return (role ? q.where(eq(parties.role, role)) : q).orderBy(parties.name).all();
  }
  getParty(id: number) { return db.select().from(parties).where(eq(parties.id, id)).get(); }
  createParty(d: InsertParty) {
    if (!STATES[d.stateCode]) throw new ErpError("Unknown state code");
    if (d.gstin.slice(0, 2) !== d.stateCode) throw new ErpError(`GSTIN starts with ${d.gstin.slice(0, 2)} but state code is ${d.stateCode}`);
    return db.insert(parties).values(d).returning().get();
  }

  // ---------- Indents ----------
  listIndents() { return db.select().from(indents).orderBy(desc(indents.id)).all(); }
  createIndent(itemId: number, qty: number, requiredBy: string) {
    const it = storage.getItem(itemId);
    if (!it) throw new ErpError("Item not found");
    if (storage.listBom(itemId).length) throw new ErpError("This item is manufactured — plan a production order instead");
    return db.insert(indents).values({ indentNo: nextNo("indents", "indent_no", `IND/${fyOf(today())}/`), itemId, qty, requiredBy }).returning().get();
  }

  // ---------- Purchase ----------
  listPOs() {
    return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.id)).all()
      .map(p => ({ ...p, lines: db.select().from(poLines).where(eq(poLines.poId, p.id)).all() }));
  }
  createPO(vendorId: number, lines: { itemId: number; qty: number; rate: number }[], indentIds: number[], date = today()) {
    const v = this.getParty(vendorId);
    if (!v || v.role !== "VENDOR") throw new ErpError("Choose a vendor");
    return sqlite.transaction(() => {
      const po = db.insert(purchaseOrders).values({ poNo: nextNo("purchase_orders", "po_no", `PUR/${fyOf(date)}/`), vendorId, date }).returning().get();
      for (const l of lines) db.insert(poLines).values({ poId: po.id, ...l }).run();
      if (indentIds.length) db.update(indents).set({ status: "ORDERED", poId: po.id }).where(inArray(indents.id, indentIds)).run();
      return po;
    })();
  }
  listGrns() { return db.select().from(grns).orderBy(desc(grns.id)).all(); }
  /** Goods receipt against PO → stock lands in QC Quarantine for incoming inspection */
  createGrn(poId: number, vendorInvoiceNo: string, lines: { poLineId: number; qty: number; batchNo: string | null }[], date = today()) {
    const po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
    if (!po) throw new ErpError("PO not found");
    if (po.status === "CLOSED") throw new ErpError("PO is already fully received");
    const vendor = this.getParty(po.vendorId)!;
    const cfg = this.getSettings();
    const qc = storage.listWarehouses().find(w => w.code === "QC")!;
    const pls = db.select().from(poLines).where(eq(poLines.poId, poId)).all();
    const take = lines.filter(l => l.qty > 0);
    if (!take.length) throw new ErpError("Enter a received quantity for at least one line");
    let taxable = 0, cgst = 0, sgst = 0, igst = 0;
    const grnNo = nextNo("grns", "grn_no", `GRN/${fyOf(date)}/`);
    const out: any[] = [];
    sqlite.transaction(() => {
      for (const l of take) {
        const pl = pls.find(p => p.id === l.poLineId);
        if (!pl) throw new ErpError("PO line mismatch");
        const it = storage.getItem(pl.itemId)!;
        const pending = pl.qty - pl.receivedQty;
        if (l.qty > pending + 1e-9) throw new ErpError(`${it.code}: receiving ${l.qty} but only ${pending} pending on PO`);
        if (it.tracking === "batch" && !l.batchNo) throw new ErpError(`${it.code}: supplier batch / lot no. required`);
        const amt = r2(l.qty * pl.rate);
        const g = gstSplit(amt, it.gstRate, cfg.stateCode, vendor.stateCode);
        taxable += amt; cgst += g.cgst; sgst += g.sgst; igst += g.igst;
        storage.addTxn({ date, itemId: it.id, warehouseId: qc.id, qty: l.qty, txnType: "RECEIPT", ref: grnNo, batchNo: l.batchNo || null, unitCost: pl.rate });
        db.update(poLines).set({ receivedQty: pl.receivedQty + l.qty }).where(eq(poLines.id, pl.id)).run();
        out.push({ poLineId: pl.id, itemId: it.id, qty: l.qty, rate: pl.rate, batchNo: l.batchNo, gstRate: it.gstRate, ...g });
      }
      const after = db.select().from(poLines).where(eq(poLines.poId, poId)).all();
      const status = after.every(p => p.receivedQty >= p.qty - 1e-9) ? "CLOSED" : "PARTIAL";
      db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, poId)).run();
      db.insert(grns).values({ grnNo, poId, date, vendorInvoiceNo, lines: JSON.stringify(out), taxable: r2(taxable), cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), total: r2(taxable + cgst + sgst + igst) }).run();
    })();
    return { grnNo };
  }

  // ---------- Sales ----------
  listSOs() {
    return db.select().from(salesOrders).orderBy(desc(salesOrders.id)).all()
      .map(s => ({ ...s, lines: db.select().from(soLines).where(eq(soLines.soId, s.id)).all() }));
  }
  createSO(customerId: number, customerPo: string, deliveryDate: string, lines: { itemId: number; qty: number; rate: number }[], date = today()) {
    const c = this.getParty(customerId);
    if (!c || c.role !== "CUSTOMER") throw new ErpError("Choose a customer");
    for (const l of lines) if (storage.getItem(l.itemId)?.type !== "FG") throw new ErpError("Sales orders can only contain finished goods");
    return sqlite.transaction(() => {
      const so = db.insert(salesOrders).values({ soNo: nextNo("sales_orders", "so_no", `SO/${fyOf(date)}/`), customerId, customerPo, date, deliveryDate }).returning().get();
      for (const l of lines) db.insert(soLines).values({ soId: so.id, ...l }).run();
      return so;
    })();
  }

  // ---------- GST invoice + dispatch ----------
  listInvoices(): Invoice[] { return db.select().from(invoices).orderBy(desc(invoices.id)).all(); }
  getInvoice(id: number) { return db.select().from(invoices).where(eq(invoices.id, id)).get(); }
  createInvoice(soId: number, req: { soLineId: number; qty: number }[], transport: { vehicleNo: string | null; transporter: string | null; distanceKm: number }, date = today()) {
    const so = db.select().from(salesOrders).where(eq(salesOrders.id, soId)).get();
    if (!so) throw new ErpError("Sales order not found");
    const cust = this.getParty(so.customerId)!;
    const cfg = this.getSettings();
    const fg = storage.listWarehouses().find(w => w.code === "FG")!;
    const sls = db.select().from(soLines).where(eq(soLines.soId, soId)).all();
    const take = req.filter(l => l.qty > 0);
    if (!take.length) throw new ErpError("Enter a dispatch quantity for at least one line");
    const invNo = nextNo("invoices", "inv_no", `INV/${fyOf(date)}/`);
    let id = 0;
    sqlite.transaction(() => {
      const lines: InvoiceLine[] = [];
      const batches = storage.stockByBatch().filter(b => b.warehouseId === fg.id);
      for (const l of take) {
        const sl = sls.find(s => s.id === l.soLineId);
        if (!sl) throw new ErpError("SO line mismatch");
        const it = storage.getItem(sl.itemId)!;
        const pending = sl.qty - sl.dispatchedQty;
        if (l.qty > pending) throw new ErpError(`${it.code}: dispatching ${l.qty} but only ${pending} pending`);
        const avail = batches.filter(b => b.itemId === it.id).reduce((s, b) => s + b.qty, 0);
        if (l.qty > avail + 1e-9) throw new ErpError(`${it.code}: only ${avail} in Finished Goods Stores`);
        let need = l.qty;
        for (const b of batches.filter(b => b.itemId === it.id)) {
          if (need <= 0) break;
          const q = Math.min(need, b.qty);
          storage.addTxn({ date, itemId: it.id, warehouseId: fg.id, qty: -q, txnType: "DISPATCH", ref: invNo, batchNo: b.batchNo, unitCost: storage.rolledCost(it.id) });
          b.qty -= q; need -= q;
        }
        let sns: string[] = [];
        if (it.tracking === "serial") {
          const rows = sqlite.prepare(`SELECT id, serial_no FROM serials WHERE item_id = ? AND status = 'IN_STOCK' ORDER BY id LIMIT ?`).all(it.id, l.qty) as any[];
          if (rows.length < l.qty) throw new ErpError(`${it.code}: not enough serialised units in stock`);
          sns = rows.map(r => r.serial_no);
          lines.push({ soLineId: sl.id, itemId: it.id, code: it.code, name: it.name, hsn: it.hsn, uom: it.uom, qty: l.qty, rate: sl.rate, taxable: 0, gstRate: it.gstRate, cgst: 0, sgst: 0, igst: 0, serials: sns, customerPartNo: it.customerPartNo });
          (lines as any).__ids = [...((lines as any).__ids ?? []), ...rows.map(r => r.id)];
        } else {
          lines.push({ soLineId: sl.id, itemId: it.id, code: it.code, name: it.name, hsn: it.hsn, uom: it.uom, qty: l.qty, rate: sl.rate, taxable: 0, gstRate: it.gstRate, cgst: 0, sgst: 0, igst: 0, serials: [], customerPartNo: it.customerPartNo });
        }
        db.update(soLines).set({ dispatchedQty: sl.dispatchedQty + l.qty }).where(eq(soLines.id, sl.id)).run();
      }
      let taxable = 0, cgst = 0, sgst = 0, igst = 0;
      for (const ln of lines) {
        ln.taxable = r2(ln.qty * ln.rate);
        Object.assign(ln, gstSplit(ln.taxable, ln.gstRate, cfg.stateCode, cust.stateCode));
        taxable += ln.taxable; cgst += ln.cgst; sgst += ln.sgst; igst += ln.igst;
      }
      const gross = r2(taxable + cgst + sgst + igst);
      const total = Math.round(gross);
      const serialIds: number[] = (lines as any).__ids ?? [];
      const inv = db.insert(invoices).values({
        invNo, soId, customerId: cust.id, date, placeOfSupply: cust.stateCode, lines: JSON.stringify(lines),
        taxable: r2(taxable), cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), roundOff: r2(total - gross), total,
        vehicleNo: transport.vehicleNo || null, transporter: transport.transporter || null, distanceKm: transport.distanceKm || cust.distanceKm,
      }).returning().get();
      id = inv.id;
      if (serialIds.length) db.update(serials).set({ status: "DISPATCHED", invoiceId: inv.id }).where(inArray(serials.id, serialIds)).run();
      const after = db.select().from(soLines).where(eq(soLines.soId, soId)).all();
      db.update(salesOrders).set({ status: after.every(s => s.dispatchedQty >= s.qty) ? "CLOSED" : "PARTIAL" }).where(eq(salesOrders.id, soId)).run();
    })();
    return this.getInvoice(id)!;
  }
  /** Record IRN / Ack / EWB numbers returned by the IRP / e-way bill portal */
  recordIrn(id: number, d: { irn?: string | null; ackNo?: string | null; ewbNo?: string | null }) {
    if (d.irn && !/^[0-9a-f]{64}$/i.test(d.irn)) throw new ErpError("IRN must be the 64-character hash returned by the IRP");
    return db.update(invoices).set(d).where(eq(invoices.id, id)).returning().get();
  }

  /** E-invoice JSON in the NIC / IRP schema (v1.1) for upload via GSP or the IRP bulk tool */
  eInvoiceJson(id: number) {
    const inv = this.getInvoice(id);
    if (!inv) throw new ErpError("Invoice not found");
    const cfg = this.getSettings();
    if (!cfg.gstin) throw new ErpError("Add the company GSTIN in Tally & Company before generating e-invoice JSON");
    const b = this.getParty(inv.customerId)!;
    const lines = JSON.parse(inv.lines) as InvoiceLine[];
    const dt = inv.date.split("-").reverse().join("/");
    const doc: any = {
      Version: "1.1",
      TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
      DocDtls: { Typ: "INV", No: inv.invNo, Dt: dt },
      SellerDtls: { Gstin: cfg.gstin, LglNm: cfg.legalName, Addr1: cfg.address, Loc: cfg.city, Pin: +cfg.pincode, Stcd: cfg.stateCode },
      BuyerDtls: { Gstin: b.gstin, LglNm: b.name, Pos: inv.placeOfSupply, Addr1: b.address, Loc: b.city, Pin: +b.pincode, Stcd: b.stateCode },
      ItemList: lines.map((l, i) => ({
        SlNo: String(i + 1), PrdDesc: l.name + (l.customerPartNo ? ` (${l.customerPartNo})` : ""), IsServc: "N", HsnCd: l.hsn,
        Qty: l.qty, Unit: l.uom, UnitPrice: l.rate, TotAmt: l.taxable, AssAmt: l.taxable, GstRt: l.gstRate,
        IgstAmt: l.igst, CgstAmt: l.cgst, SgstAmt: l.sgst, TotItemVal: r2(l.taxable + l.igst + l.cgst + l.sgst),
      })),
      ValDtls: { AssVal: inv.taxable, CgstVal: inv.cgst, SgstVal: inv.sgst, IgstVal: inv.igst, RndOffAmt: inv.roundOff, TotInvVal: inv.total },
    };
    if (cfg.plantAddress && cfg.plantPincode !== cfg.pincode) doc.DispDtls = { Nm: cfg.legalName, Addr1: cfg.plantAddress, Loc: cfg.plantCity, Pin: +cfg.plantPincode, Stcd: cfg.stateCode };
    if (inv.total > 50000 && inv.vehicleNo) doc.EwbDtls = { TransName: inv.transporter ?? undefined, Distance: inv.distanceKm, TransMode: "1", VehNo: inv.vehicleNo.replace(/\s/g, ""), VehType: "R" };
    return doc;
  }

  /** Later phases register extra Tally vouchers (credit/debit notes, job work invoices) */
  extraTally: ((from: string, to: string) => string[])[] = [];

  // ---------- Tally Prime XML export ----------
  tallyXml(from: string, to: string) {
    const cfg = this.getSettings();
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const d8 = (d: string) => d.replace(/-/g, "");
    const le = (ledger: string, amt: number) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${amt < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amt.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    const vouchers: string[] = [];
    // Tally convention: debit = negative, credit = positive
    for (const inv of this.listInvoices().filter(i => i.status !== "CANCELLED" && i.date >= from && i.date <= to).reverse()) {
      const p = this.getParty(inv.customerId)!;
      const so = db.select().from(salesOrders).where(eq(salesOrders.id, inv.soId)).get();
      const e = [le(p.name, -inv.total), le(cfg.salesLedger, inv.taxable)];
      if (inv.cgst) e.push(le("Output CGST", inv.cgst), le("Output SGST", inv.sgst));
      if (inv.igst) e.push(le("Output IGST", inv.igst));
      if (inv.roundOff) e.push(le("Round Off", inv.roundOff));
      vouchers.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${d8(inv.date)}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(inv.invNo)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(p.name)}</PARTYLEDGERNAME><PARTYGSTIN>${p.gstin}</PARTYGSTIN><PLACEOFSUPPLY>${esc(STATES[inv.placeOfSupply] ?? "")}</PLACEOFSUPPLY><IRN>${inv.irn ?? ""}</IRN><NARRATION>${esc(`${so?.soNo ?? ""} · Cust PO ${so?.customerPo ?? "-"} · EWB ${inv.ewbNo ?? "-"}`)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${e.join("")}</VOUCHER></TALLYMESSAGE>`);
    }
    for (const g of this.listGrns().filter(g => g.date >= from && g.date <= to).reverse()) {
      const po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, g.poId)).get()!;
      const v = this.getParty(po.vendorId)!;
      const e = [le(v.name, g.total), le(cfg.purchaseLedger, -g.taxable)];
      if (g.cgst) e.push(le("Input CGST", -g.cgst), le("Input SGST", -g.sgst));
      if (g.igst) e.push(le("Input IGST", -g.igst));
      vouchers.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${d8(g.date)}</DATE><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(g.grnNo)}</VOUCHERNUMBER><REFERENCE>${esc(g.vendorInvoiceNo)}</REFERENCE><PARTYLEDGERNAME>${esc(v.name)}</PARTYLEDGERNAME><PARTYGSTIN>${v.gstin}</PARTYGSTIN><NARRATION>${esc(`Against ${po.poNo}`)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${e.join("")}</VOUCHER></TALLYMESSAGE>`);
    }
    for (const extra of this.extraTally) vouchers.push(...extra(from, to));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(cfg.tallyCompany)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>\n${vouchers.join("\n")}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
    return { xml, count: vouchers.length };
  }

  summary() {
    const t = today();
    const sos = this.listSOs().filter(s => s.status !== "CLOSED");
    const orderBook = sos.reduce((a, s) => a + s.lines.reduce((b, l) => b + (l.qty - l.dispatchedQty) * l.rate, 0), 0);
    const overdue = sos.filter(s => s.deliveryDate < t).length;
    const inv = this.listInvoices().filter(i => i.status !== "CANCELLED");
    const mtd = inv.filter(i => i.date.slice(0, 7) === t.slice(0, 7)).reduce((a, i) => a + i.taxable, 0);
    return { orderBook: Math.round(orderBook), openSOs: sos.length, overdue, salesMtd: Math.round(mtd), irnPending: inv.filter(i => !i.irn).length,
      openIndents: this.listIndents().filter(i => i.status === "OPEN").length, openPOs: this.listPOs().filter(p => p.status !== "CLOSED").length };
  }

  // ---------- Seed ----------
  seed() {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, legal_name TEXT NOT NULL, gstin TEXT NOT NULL, state_code TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, pincode TEXT NOT NULL, cin TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', plant_address TEXT NOT NULL DEFAULT '', plant_city TEXT NOT NULL DEFAULT '', plant_pincode TEXT NOT NULL DEFAULT '', certifications TEXT NOT NULL DEFAULT '', tally_company TEXT NOT NULL, sales_ledger TEXT NOT NULL, purchase_ledger TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS parties (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, gstin TEXT NOT NULL, state_code TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, pincode TEXT NOT NULL, distance_km INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS indents (id INTEGER PRIMARY KEY AUTOINCREMENT, indent_no TEXT NOT NULL UNIQUE, item_id INTEGER NOT NULL, qty REAL NOT NULL, required_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', po_id INTEGER);
      CREATE TABLE IF NOT EXISTS purchase_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, po_no TEXT NOT NULL UNIQUE, vendor_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN');
      CREATE TABLE IF NOT EXISTS po_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, po_id INTEGER NOT NULL, item_id INTEGER NOT NULL, qty REAL NOT NULL, rate REAL NOT NULL, received_qty REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS grns (id INTEGER PRIMARY KEY AUTOINCREMENT, grn_no TEXT NOT NULL UNIQUE, po_id INTEGER NOT NULL, date TEXT NOT NULL, vendor_invoice_no TEXT NOT NULL, lines TEXT NOT NULL, taxable REAL NOT NULL, cgst REAL NOT NULL, sgst REAL NOT NULL, igst REAL NOT NULL, total REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS sales_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, so_no TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL, customer_po TEXT NOT NULL, date TEXT NOT NULL, delivery_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN');
      CREATE TABLE IF NOT EXISTS so_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, so_id INTEGER NOT NULL, item_id INTEGER NOT NULL, qty REAL NOT NULL, rate REAL NOT NULL, dispatched_qty REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, inv_no TEXT NOT NULL UNIQUE, so_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, date TEXT NOT NULL, place_of_supply TEXT NOT NULL, lines TEXT NOT NULL, taxable REAL NOT NULL, cgst REAL NOT NULL, sgst REAL NOT NULL, igst REAL NOT NULL, round_off REAL NOT NULL DEFAULT 0, total REAL NOT NULL, vehicle_no TEXT, transporter TEXT, distance_km INTEGER NOT NULL DEFAULT 0, irn TEXT, ack_no TEXT, ewb_no TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE');
    `);
    if (this.listParties().length) return;
    db.insert(settings).values({
      id: 1, legalName: "Tau Power Electronics Private Limited", gstin: "27AAKCT4244J1Z0", stateCode: "27",
      address: "701 & 702 Aquila, Plot No. 101, Anand Park, Aundh", city: "Pune", pincode: "411007",
      cin: "U27900PN2023PTC224077", phone: "+91 91721 23430", email: "info@tau-power.com",
      plantAddress: "247/2, Phase 2, Rajiv Gandhi Infotech Park, Hinjawadi", plantCity: "Pune", plantPincode: "411057",
      certifications: "IATF 16949 · CE · E-Mark · CNAS",
      tallyCompany: "Tau Power Electronics Private Limited", salesLedger: "Sales - GST 18%", purchaseLedger: "Purchase - GST 18%",
    }).run();
    const P: [string, string, string, string, string, string, string, string, number][] = [
      ["C-APEX", "Apex Commercial Vehicles Ltd", "CUSTOMER", "27AABCA4521M1Z2", "27", "Chakan Industrial Area Phase II", "Pune", "410501", 35],
      ["C-NORTH", "Northline Motors Pvt Ltd", "CUSTOMER", "06AADCN7788Q1Z9", "06", "Sector 8, IMT Manesar", "Gurugram", "122051", 1420],
      ["C-DECCAN", "Deccan Engines Ltd", "CUSTOMER", "33AAECD3310R1ZK", "33", "Oragadam Industrial Corridor", "Chennai", "602105", 1180],
      ["C-ORIENT", "Orient Engineering Solutions", "CUSTOMER", "27AAHFO4821K1Z1", "27", "Pune (address to be confirmed)", "Pune", "411026", 25], // GSTIN is a demo placeholder
      ["V-ZIRCO", "Zircotech Ceramics Pvt Ltd", "VENDOR", "29AAFCZ9012B1Z4", "29", "Peenya Industrial Area", "Bengaluru", "560058", 840],
      ["V-PCAB", "Precision Cables & Wires", "VENDOR", "27AAKFP5566C1ZT", "27", "Bhosari MIDC, T-Block", "Pune", "411026", 8],
      ["V-SEAL", "Sealcon Connectors LLP", "VENDOR", "24AAQFS2201D1Z8", "24", "GIDC Vatva Phase IV", "Ahmedabad", "382445", 660],
      ["V-MICRO", "Microsense Semiconductors Pvt Ltd", "VENDOR", "36AAHCM8743E1ZQ", "36", "Hardware Park, Maheshwaram", "Hyderabad", "501510", 560],
    ];
    const id: Record<string, number> = {};
    for (const p of P) id[p[0]] = this.createParty({ code: p[0], name: p[1], role: p[2], gstin: p[3].slice(0, 14) + gstinCheckChar(p[3].slice(0, 14)), // demo GSTINs made checksum-valid
      stateCode: p[4], address: p[5], city: p[6], pincode: p[7], distanceKm: p[8] }).id;
    const I = Object.fromEntries(storage.listItems().map(i => [i.code, i]));
    // purchase history
    const po1 = this.createPO(id["V-ZIRCO"], [{ itemId: I["RM-ZR-NOX"].id, qty: 200, rate: 2850 }, { itemId: I["RM-ZR-LMBW"].id, qty: 300, rate: 690 }], [], "2026-10-01");
    const l1 = db.select().from(poLines).where(eq(poLines.poId, po1.id)).all();
    this.createGrn(po1.id, "ZCT/2627/1184", [{ poLineId: l1[0].id, qty: 120, batchNo: "ZN-2610-011" }, { poLineId: l1[1].id, qty: 0, batchNo: null }], "2026-10-07");
    this.createPO(id["V-MICRO"], [{ itemId: I["RM-PZ-MEMS"].id, qty: 300, rate: 310 }], [], "2026-10-06");
    this.createIndent(I["RM-PCB-NOX"].id, 150, "2026-10-20");
    this.createIndent(I["RM-TC-K"].id, 400, "2026-10-18");
    // sales history
    const so1 = this.createSO(id["C-APEX"], "ACV/PO/88231", "2026-10-10", [{ itemId: I["FG-EGTS-TC"].id, qty: 120, rate: 1450 }, { itemId: I["FG-LD6000-D1"].id, qty: 60, rate: 1350 }], "2026-10-02");
    const s1 = db.select().from(soLines).where(eq(soLines.soId, so1.id)).all();
    this.createInvoice(so1.id, [{ soLineId: s1[0].id, qty: 120 }, { soLineId: s1[1].id, qty: 40 }], { vehicleNo: "MH12 AB 4521", transporter: "Shree Logistics", distanceKm: 35 }, "2026-10-08");
    const so2 = this.createSO(id["C-NORTH"], "NML-4500021934", "2026-10-25", [{ itemId: I["FG-NOX-BS6"].id, qty: 40, rate: 8900 }, { itemId: I["FG-DPS-SENT"].id, qty: 50, rate: 2150 }], "2026-10-05");
    this.createSO(id["C-DECCAN"], "DEL/SCM/7710", "2026-10-30", [{ itemId: I["FG-UQS-US"].id, qty: 30, rate: 4200 }, { itemId: I["FG-LD6549"].id, qty: 50, rate: 2600 }], "2026-10-07");
    void so2;
    // From Tau Power sales invoice: EGTS for Orient Engineering Solutions (TML parts). Customer PO no. is a placeholder.
    this.createSO(id["C-ORIENT"], "OES/PO/26-27/0142", "2026-10-12", [{ itemId: I["TTT000002"].id, qty: 11, rate: 1050 }, { itemId: I["TTT000004"].id, qty: 7, rate: 1050 }], "2026-10-06");
    this.createSO(id["C-ORIENT"], "OES/PO/26-27/0151", "2026-10-20", [{ itemId: I["TTT000002"].id, qty: 15, rate: 1050 }], "2026-10-09");
  }
}

export const phase2 = new Phase2();
phase2.seed();
