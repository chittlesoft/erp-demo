// Database seeder for the Tau Power ERP.
// Seeds company settings, warehouses, items, BOM, opening stock, production
// history (with serials), parties (customer + vendors), purchase orders/GRNs,
// sales orders and one GST invoice.
//
// Idempotent: does nothing if the item table already has rows.

import { db } from "@/lib/db";
import { PREFIX, fyNo, roundQty, simulatedEol, today } from "./shared";
import { rolledCost } from "./service";
import type { PdiChar } from "./pdi-shared";
import { ensureRoutings } from "./phase3";

type SeedItem = [code: string, name: string, type: string, line: string | null, hsn: string, uom: string, tracking: string, reorder: number, cost: number, cpn: string | null];
type BomSeed = [parent: string, comp: string, qty: number, scrap: number];
type Receipt = [code: string, qty: number, batch: string | null];
type History = [code: string, qty: number, good: number, reject: number, date: string];

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

const SEED_ITEMS: SeedItem[] = [
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
  ["TTT000002", "EGTS (Analogue) - 108", "FG", "EGTS", "90271000", "NOS", "serial", 20, 0, "570615249301"],
  ["TTT000004", "EGT Sensor", "FG", "EGTS", "90251990", "NOS", "serial", 20, 0, "570615249303"],
];

const SEED_BOM: BomSeed[] = [
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

const OPENING_STOCK: Receipt[] = [
  ["RM-ZR-NOX", 120, "ZN-2609-014"], ["RM-ZR-NOX", 160, "ZN-2610-003"], ["RM-ZR-LMB2", 520, "ZL-2609-021"], ["RM-ZR-LMBW", 260, "ZW-2609-006"],
  ["RM-TC-K", 650, "TC-2609-110"], ["RM-NTC-HT", 400, "NT-2609-031"], ["RM-PZ-MEMS", 180, "PZ-2609-007"], ["RM-US-TRX", 210, "US-2609-002"],
  ["RM-PCB-NOX", 240, "PN-2609-031"], ["RM-PCB-SENT", 420, "PS-2609-044"], ["RM-PCB-EGT", 700, "PE-2609-018"], ["RM-PCB-UQS", 200, "PU-2609-005"],
  ["RM-HSG-M20", 2200, "HS-2609-090"], ["RM-HSG-M14", 400, "H14-2609-003"], ["RM-HSG-M12", 400, "H12-2609-002"], ["RM-HSG-PA66", 1100, "HP-2609-012"],
  ["RM-PROT-D1", 420, "D1-2609-011"], ["RM-PROT-D3", 360, "D3-2609-004"], ["RM-PTUBE", 600, "PT-2609-055"],
  ["RM-CBL-HT", 1500, "CB-2609-008"], ["RM-CON-4P", 2000, "C4-2609-017"], ["RM-CON-5P", 320, "C5-2609-009"], ["RM-CON-6P", 260, "C6-2609-003"], ["RM-GRM-SIL", 3000, null],
];

// Spread production runs across the last 14 days so the trend chart shows a
// contiguous, fuller time-series. Dates are computed at seed time as
// `YYYY-MM-DD` UTC day offsets from "today" — matching the trend API's
// `startDate()`/`dateRange()` logic, so the serials fall inside the
// `serials WHERE date >= today - (days-1)` window.
const isoOffset = (offset: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

// Same total good/reject as the original concentrated seed (707 good / 23
// reject across serial-tracked FG items + the SFG-NOX-PRB sub-assembly run),
// just distributed one run per day. Three items get a second, smaller run on
// a different day (FG-NOX-BS6, FG-EGTS-TC, FG-LD6000-D3, FG-DPS-SENT) — see
// the `historySeen` counter in the seed loop for the orderNo dedup suffix.
const HISTORY: History[] = [
  ["SFG-NOX-PRB", 60, 58, 2, isoOffset(13)],
  ["FG-NOX-BS6", 20, 19, 1, isoOffset(13)],
  ["FG-EGTS-TC", 100, 98, 2, isoOffset(12)],
  ["FG-EGTS-NTC", 60, 59, 1, isoOffset(11)],
  ["FG-LD6000-D1", 120, 116, 4, isoOffset(10)],
  ["FG-LD6000-D3", 30, 29, 1, isoOffset(9)],
  ["FG-LD6549", 70, 66, 4, isoOffset(8)],
  ["FG-DPS-SENT", 40, 39, 1, isoOffset(7)],
  ["FG-UQS-US", 40, 37, 3, isoOffset(6)],
  ["FG-EGTS-TC", 100, 98, 2, isoOffset(5)],
  ["TTT000002", 30, 29, 1, isoOffset(4)],
  ["FG-LD6000-D3", 30, 29, 1, isoOffset(3)],
  ["TTT000004", 20, 20, 0, isoOffset(2)],
  ["FG-NOX-BS6", 30, 28, 2, isoOffset(1)],
  ["FG-DPS-SENT", 40, 40, 0, isoOffset(0)],
];

let _seeded = false;
export async function ensureSeeded(force = false) {
  if (_seeded && !force) return;
  const count = await db.item.count();
  if (count > 0 && !force) { _seeded = true; return; }

  if (force) {
    // wipe in dependency order
    await db.gspLog.deleteMany({});
    await db.note.deleteMany({});
    await db.jobWorkChallan.deleteMany({});
    await db.pdiReport.deleteMany({});
    await db.pdiPlan.deleteMany({});
    await db.ppap.deleteMany({});
    await db.ncr.deleteMany({});
    await db.inspection.deleteMany({});
    await db.cycleCount.deleteMany({});
    await db.binTxn.deleteMany({});
    await db.bin.deleteMany({});
    await db.opLog.deleteMany({});
    await db.wipUnit.deleteMany({});
    await db.routingOp.deleteMany({});
    await db.serial.deleteMany({});
    await db.productionOrder.deleteMany({});
    await db.invoice.deleteMany({});
    await db.soLine.deleteMany({});
    await db.salesOrder.deleteMany({});
    await db.grn.deleteMany({});
    await db.poLine.deleteMany({});
    await db.purchaseOrder.deleteMany({});
    await db.indent.deleteMany({});
    await db.party.deleteMany({});
    await db.stockTxn.deleteMany({});
    await db.bomLine.deleteMany({});
    await db.item.deleteMany({});
    await db.warehouse.deleteMany({});
    await db.settings.deleteMany({});
  }

  // ---------- Company settings ----------
  await db.settings.create({
    data: {
      id: 1,
      legalName: "Tau Power Electronics Private Limited",
      gstin: "27AAKCT4244J1Z0",
      stateCode: "27",
      address: "701 & 702 Aquila, Plot No. 101, Anand Park, Aundh",
      city: "Pune",
      pincode: "411007",
      cin: "U27900PN2023PTC224077",
      phone: "+91 91721 23430",
      email: "info@tau-power.com",
      plantAddress: "247/2, Phase 2, Rajiv Gandhi Infotech Park, Hinjawadi",
      plantCity: "Pune",
      plantPincode: "411057",
      certifications: "IATF 16949, CE, E-Mark (VCA UK), CNAS EMC labs; ISO 26262, ECE R10, BS VI, Euro VI, China VI",
      tallyCompany: "Tau Power Electronics",
      salesLedger: "Sales (Local)",
      purchaseLedger: "Purchase (Local)",
    },
  });

  // ---------- Warehouses ----------
  const wh = await db.$transaction([
    db.warehouse.create({ data: { code: "RM", name: "Raw Material Stores" } }),
    db.warehouse.create({ data: { code: "WIP", name: "Shop Floor WIP" } }),
    db.warehouse.create({ data: { code: "FG", name: "Finished Goods Stores" } }),
    db.warehouse.create({ data: { code: "QC", name: "QC Quarantine" } }),
    db.warehouse.create({ data: { code: "REJ", name: "Rejected / Return-to-vendor" } }),
    db.warehouse.create({ data: { code: "JW", name: "Job-worker Stores" } }),
  ]);
  const W: Record<string, number> = Object.fromEntries(wh.map(w => [w.code, w.id]));

  // ---------- Items ----------
  const I: Record<string, number> = {};
  for (const s of SEED_ITEMS) {
    const [code, name, type, line, hsn, uom, tracking, reorder, cost, cpn] = s;
    const it = await db.item.create({ data: { code, name, type, productLine: line, hsn, uom, tracking, reorderLevel: reorder, stdCost: cost, customerPartNo: cpn, gstRate: 18, specs: SPECS[code] ?? null } });
    I[code] = it.id;
  }

  // ---------- BOM ----------
  for (const [p, c, q, sc] of SEED_BOM) {
    await db.bomLine.create({ data: { parentItemId: I[p], componentItemId: I[c], qty: q, scrapPct: sc, version: "A" } });
  }

  // ---------- Opening stock ----------
  for (const [code, q, b] of OPENING_STOCK) {
    await db.stockTxn.create({ data: { date: "2026-09-22", itemId: I[code], warehouseId: W.RM, qty: q, txnType: "RECEIPT", ref: "GRN-OPENING", batchNo: b, unitCost: SEED_ITEMS.find(s => s[0] === code)![8] } });
  }
  // one lot still in QC quarantine
  await db.stockTxn.create({ data: { date: "2026-10-05", itemId: I["RM-TC-K"], warehouseId: W.QC, qty: 60, txnType: "RECEIPT", ref: "GRN-2610-004", batchNo: "TC-2610-118", unitCost: 420 } });

  // ---------- Production history (completed orders w/ serials) ----------
  // `historySeen` deduplicates orderNos: when an item appears more than once
  // in HISTORY (a second, smaller run on a different day), the 2nd+ order gets
  // a `-R{n}` suffix so the `orderNo` UNIQUE constraint isn't violated.
  const historySeen: Record<string, number> = {};
  for (const [code, q, g, r, d] of HISTORY) {
    historySeen[code] = (historySeen[code] ?? 0) + 1;
    const idx = Object.keys(I).indexOf(code) + 1;
    const orderNo = historySeen[code] === 1
      ? `PO-26-${String(idx).padStart(4, "0")}`
      : `PO-26-${String(idx).padStart(4, "0")}-R${historySeen[code]}`;
    const order = await db.productionOrder.create({ data: { orderNo, itemId: I[code], qty: q, dueDate: d, status: "IN_PROGRESS", warehouseId: code.startsWith("SFG") ? W.WIP : W.FG, consumedBatches: "[]" } });
    // issue material FIFO (skip detail; just mark consumed)
    await db.stockTxn.create({ data: { date: d, itemId: I[code], warehouseId: order.warehouseId, qty: g, txnType: "PROD_OUT", ref: orderNo, batchNo: orderNo, unitCost: await rolledCost(I[code]) } });
    // serials
    const item = await db.item.findUnique({ where: { id: I[code] } });
    if (item && item.tracking === "serial") {
      const ym = d.slice(2, 4) + d.slice(5, 7);
      const prefix = `${PREFIX[item.productLine ?? ""] ?? "FG"}-${ym}-`;
      const existing = await db.serial.findMany({ where: { serialNo: { startsWith: prefix } }, select: { serialNo: true } });
      let seq = existing.length ? Math.max(...existing.map(s => parseInt(s.serialNo.slice(prefix.length), 10))) : 0;
      const results = [...Array(g).fill("PASS"), ...Array(r).fill("FAIL")];
      for (const res of results) {
        seq++;
        await db.serial.create({ data: { serialNo: prefix + String(seq).padStart(5, "0"), itemId: item.id, productionOrderId: order.id, eolResult: res, eolData: JSON.stringify(simulatedEol(item.productLine, res === "PASS")), date: d, status: res === "PASS" ? "IN_STOCK" : "REJECTED" } });
      }
    }
    await db.productionOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", goodQty: g, rejectQty: r } });
  }

  // ---------- Open + in-progress planned orders ----------
  const ip = await db.productionOrder.create({ data: { orderNo: "PO-26-0100", itemId: I["FG-EGTS-TC"], qty: 150, dueDate: "2026-10-12", status: "IN_PROGRESS", warehouseId: W.FG, consumedBatches: "[]" } });
  await db.productionOrder.create({ data: { orderNo: "PO-26-0101", itemId: I["FG-NOX-BS6"], qty: 100, dueDate: "2026-10-16", warehouseId: W.FG } });
  await db.productionOrder.create({ data: { orderNo: "PO-26-0102", itemId: I["FG-LD6549"], qty: 120, dueDate: "2026-10-20", warehouseId: W.FG } });
  await db.productionOrder.create({ data: { orderNo: "PO-26-0103", itemId: I["FG-DPS-SENT"], qty: 60, dueDate: "2026-10-22", warehouseId: W.FG } });

  // ---------- Parties ----------
  // Customer: Orient Engineering Solutions (Pune) — demo GSTIN checksum-valid
  const orient = await db.party.create({ data: { code: "CUST-ORIENT", name: "Orient Engineering Solutions", role: "CUSTOMER", gstin: "27AAHFO4821K1Z1", stateCode: "27", address: "Wagholi, Pune", city: "Pune", pincode: "411026", distanceKm: 18 } });
  // Vendors
  await db.party.create({ data: { code: "VND-ZIRCON", name: "Zirconia Ceramics Pvt Ltd", role: "VENDOR", gstin: "27AAGCZ1234M1Z5", stateCode: "27", address: "Bhosari MIDC, Pune", city: "Pune", pincode: "411026", distanceKm: 12 } });
  await db.party.create({ data: { code: "VND-THERMO", name: "Thermo Sensors India", role: "VENDOR", gstin: "29AAICT9876P1Z2", stateCode: "29", address: "Peenya Industrial Area, Bengaluru", city: "Bengaluru", pincode: "560058", distanceKm: 840 } });
  // Job workers
  await db.party.create({ data: { code: "JW-SHARP", name: "Sharp Electroplaters", role: "JOBWORKER", gstin: "27AAFFS7654K1Z9", stateCode: "27", address: "Chinchwad, Pune", city: "Pune", pincode: "411019", distanceKm: 9 } });

  // ---------- Purchase order + GRN ----------
  const po = await db.purchaseOrder.create({ data: { poNo: fyNo("PO", 1, new Date("2026-10-04")), vendorId: (await db.party.findFirst({ where: { code: "VND-THERMO" } }))!.id, date: "2026-10-04", status: "PARTIAL" } });
  const pl1 = await db.poLine.create({ data: { poId: po.id, itemId: I["RM-TC-K"], qty: 500, rate: 420, receivedQty: 60 } });
  const grn = await db.grn.create({ data: { grnNo: fyNo("GRN", 4, new Date("2026-10-05")), poId: po.id, date: "2026-10-05", vendorInvoiceNo: "TSI-2610-441", lines: JSON.stringify([{ poLineId: pl1.id, itemId: I["RM-TC-K"], qty: 60, rate: 420, batchNo: "TC-2610-118" }]), taxable: 25200, cgst: 2268, sgst: 2268, igst: 0, total: 29736 } });
  await db.poLine.update({ where: { id: pl1.id }, data: { receivedQty: 60 } });

  // ---------- Sales order + invoice (Orient — the real parts) ----------
  const so = await db.salesOrder.create({ data: { soNo: fyNo("SO", 4, new Date("2026-10-09")), customerId: orient.id, customerPo: "ORIENT-PO-2610-12", date: "2026-10-09", deliveryDate: "2026-10-14", status: "PARTIAL" } });
  const sol1 = await db.soLine.create({ data: { soId: so.id, itemId: I["TTT000002"], qty: 11, rate: 1050, dispatchedQty: 0 } });
  const sol2 = await db.soLine.create({ data: { soId: so.id, itemId: I["TTT000004"], qty: 7, rate: 1050, dispatchedQty: 0 } });

  // Build invoice lines (intra-state → CGST+SGST). Allocate IN_STOCK serials FIFO.
  const settings = (await db.settings.findUnique({ where: { id: 1 } }))!;
  const intra = settings.stateCode === "27";
  const invLines: import("./shared").InvoiceLine[] = [];
  let taxable = 0;
  for (const sl of [sol1, sol2]) {
    const item = (await db.item.findUnique({ where: { id: sl.itemId } }))!;
    const serials = await db.serial.findMany({ where: { itemId: item.id, status: "IN_STOCK", invoiceId: null }, orderBy: { id: "asc" }, take: sl.qty });
    const amt = sl.qty * sl.rate;
    const gst = amt * item.gstRate / 100;
    invLines.push({
      soLineId: sl.id, itemId: item.id, code: item.code, name: item.name, hsn: item.hsn, uom: item.uom,
      qty: sl.qty, rate: sl.rate, taxable: amt, gstRate: item.gstRate,
      cgst: intra ? gst / 2 : 0, sgst: intra ? gst / 2 : 0, igst: intra ? 0 : gst,
      serials: serials.map(s => s.serialNo), customerPartNo: item.customerPartNo,
    });
    taxable += amt;
  }
  const cgst = invLines.reduce((s, l) => s + l.cgst, 0);
  const sgst = invLines.reduce((s, l) => s + l.sgst, 0);
  const total = taxable + cgst + sgst;
  const inv = await db.invoice.create({ data: { invNo: fyNo("INV", 1, new Date("2026-10-10")), soId: so.id, customerId: orient.id, date: "2026-10-10", placeOfSupply: "27", lines: JSON.stringify(invLines), taxable, cgst, sgst, igst: 0, roundOff: 0, total, vehicleNo: "MH12 GG 4521", transporter: "VRL Logistics", distanceKm: 18, status: "ACTIVE" } });
  // link serials to invoice + DISPATCHED
  for (const l of invLines) {
    for (const sno of l.serials) await db.serial.update({ where: { serialNo: sno }, data: { invoiceId: inv.id, status: "DISPATCHED" } });
  }
  for (const sl of [sol1, sol2]) await db.soLine.update({ where: { id: sl.id }, data: { dispatchedQty: sl.qty } });

  // ---------- PDI plans + reports + a second OPEN sales order + WIP units (Task 7-a) ----------
  // Mirror the original Express PDI seed (`extracted/erp-project/app/server/pdi.ts`
  // lines 147-164): TTT000002 + TTT000004 get plans with the exact characteristics
  // from the Tau Power PDI report format (TPE/IMS/FR/78 Rev 01); a second OPEN SO
  // (customerPo "OES/PO/26-27/0142") carries accepted PDI reports that haven't yet
  // been linked to an invoice — so the Quality → PDI "Awaiting inspection" list,
  // the PDI reports list, and the dispatch gate (wired in /api/sales/invoices/create)
  // all have realistic data to render + exercise.

  // PDI characteristic builders (mirror original `num` + `attr` helpers).
  const numChar = (sr: number, description: string, nominal: number, tol: number, method: string, unit = "mm"): PdiChar => ({ sr, description, kind: "num", nominal, tolMinus: tol, tolPlus: tol, spec: "", method, unit });
  const attrChar = (sr: number, description: string, spec: string, method: string): PdiChar => ({ sr, description, kind: "attr", nominal: null, tolMinus: null, tolPlus: null, spec, method, unit: "" });

  // PDI plans for TTT000002 + TTT000004 — characteristics exactly as on the Tau
  // Power PDI reports (probe/harness measured, mounting fitment attribute).
  const plan2Chars: PdiChar[] = [
    numChar(1, "Probe Length", 70, 1, "Vernier Caliper"),
    numChar(2, "Harness Length", 400, 10, "Measuring Tape"),
    attrChar(3, "Mounting Fitment", "M14x1.5-6g", "Thread Gauge"),
  ];
  const plan4Chars: PdiChar[] = [
    numChar(1, "Probe Length", 50, 1, "Vernier Caliper"),
    numChar(2, "Harness Length", 300, 10, "Measuring Tape"),
    attrChar(3, "Mounting Fitment", "M12x1.25-6h", "Thread Gauge"),
  ];
  await db.pdiPlan.create({
    data: {
      itemId: I["TTT000002"],
      characteristics: JSON.stringify({ drgRev: "00", drgDate: "2026-10-06", refStandard: "-", chars: plan2Chars }),
    },
  });
  await db.pdiPlan.create({
    data: {
      itemId: I["TTT000004"],
      characteristics: JSON.stringify({ drgRev: "00", drgDate: "2026-10-06", refStandard: "-", chars: plan4Chars }),
    },
  });

  // Second OPEN sales order — Orient customer, customerPo matching the original
  // PDI seed reference. dispatchedQty stays 0 so PDI pending() returns these lines.
  const so2 = await db.salesOrder.create({
    data: {
      soNo: fyNo("SO", 5, new Date("2026-10-09")),
      customerId: orient.id,
      customerPo: "OES/PO/26-27/0142",
      date: "2026-10-09",
      deliveryDate: "2026-10-15",
      status: "OPEN",
    },
  });
  const sol2a = await db.soLine.create({ data: { soId: so2.id, itemId: I["TTT000002"], qty: 11, rate: 1050, dispatchedQty: 0 } });
  const sol2b = await db.soLine.create({ data: { soId: so2.id, itemId: I["TTT000004"], qty: 7, rate: 1050, dispatchedQty: 0 } });

  // Accepted PDI reports for the second SO's lines — readings exactly as on the
  // attached Tau Power PDI reports; invoiceNo left null so the dispatch gate
  // sees them as available coverage (openQty) for a new invoice.
  const pdiRep1Payload = {
    pdiNo: "PDI/2610/0001",
    soId: so2.id,
    soLineId: sol2a.id,
    customerId: orient.id,
    drgRev: "00",
    drgDate: "2026-10-06",
    refStandard: "-",
    mtr: false,
    chars: plan2Chars,
    readings: [
      { sr: 1, values: ["70.02", "69.99", "70.03", "70.02", "70.01"], ok: true },
      { sr: 2, values: ["401", "402", "400", "401", "400"], ok: true },
      { sr: 3, values: ["OK", "OK", "OK", "OK", "OK"], ok: true },
    ],
    inspector: "PDI Inspector",
    note: "",
    invoiceId: null,
    invoiceDate: null,
  };
  await db.pdiReport.create({
    data: { invoiceNo: null, itemId: I["TTT000002"], qty: 11, sampleNo: 5, date: "2026-10-09", readings: JSON.stringify(pdiRep1Payload), result: "ACCEPT" },
  });
  const pdiRep2Payload = {
    pdiNo: "PDI/2610/0002",
    soId: so2.id,
    soLineId: sol2b.id,
    customerId: orient.id,
    drgRev: "00",
    drgDate: "2026-10-06",
    refStandard: "-",
    mtr: false,
    chars: plan4Chars,
    readings: [
      { sr: 1, values: ["50.02", "49.99", "50.01", "50.01", "50.01"], ok: true },
      { sr: 2, values: ["302", "300", "300", "301", "300"], ok: true },
      { sr: 3, values: ["OK", "OK", "OK", "OK", "OK"], ok: true },
    ],
    inspector: "PDI Inspector",
    note: "",
    invoiceId: null,
    invoiceDate: null,
  };
  await db.pdiReport.create({
    data: { invoiceNo: null, itemId: I["TTT000004"], qty: 7, sampleNo: 5, date: "2026-10-09", readings: JSON.stringify(pdiRep2Payload), result: "ACCEPT" },
  });

  // WIP units on the IN_PROGRESS order PO-26-0100 (FG-EGTS-TC) so the shopfloor
  // board (`/api/phase3/board`) shows stations with active WIP. ensureRoutings()
  // creates the default EGTS routing ops (seq 10..50) so the WipUnit.seq values
  // resolve to a real op (Probe assembly / Weld / Cal).
  await ensureRoutings();
  const egtsOrder = await db.productionOrder.findFirst({ where: { orderNo: "PO-26-0100" } });
  if (egtsOrder) {
    const wipSeqs = [10, 10, 20, 30]; // 2 queued at ASM-1, 1 at WELD, 1 at CAL
    let wipSeq = 201; // existing serials go up to EGT-2610-00200; start above
    for (const seq of wipSeqs) {
      const sno = `EGT-2610-${String(wipSeq).padStart(5, "0")}`;
      await db.wipUnit.create({
        data: { serialNo: sno, itemId: I["FG-EGTS-TC"], productionOrderId: egtsOrder.id, seq, status: "QUEUED", reworkCount: 0, results: "{}" },
      });
      wipSeq++;
    }
  }

  _seeded = true;
}
