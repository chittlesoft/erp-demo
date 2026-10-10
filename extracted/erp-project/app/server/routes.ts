import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { z } from "zod";
import { storage, ErpError, sqlite } from "./storage";
import { phase2 } from "./phase2";
import { phase3, STATIONS } from "./phase3";
import { pdi } from "./pdi";
import { phase4, CRN_REASONS, DBN_REASONS, DOWNTIME_REASONS, CANCEL_REASONS, KIND_LABEL } from "./phase4";
import { insertPartySchema, insertSettingsSchema, createPoSchema, createGrnSchema, createSoSchema, createInvoiceSchema, insertItemSchema, insertBomLineSchema, insertProductionOrderSchema, completeOrderSchema } from "@shared/schema";

const wrap = (fn: (req: Request) => any) => async (req: Request, res: Response) => {
  try { res.json((await fn(req)) ?? { ok: true }); }
  catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: e.issues.map((x: any) => `${x.path.join(".")}: ${x.message}`).join("; ") });
    if (e instanceof ErpError) return res.status(400).json({ message: e.message });
    if (String(e?.message).includes("UNIQUE")) return res.status(400).json({ message: "Code already exists" });
    console.error(e); res.status(500).json({ message: "Server error" });
  }
};
const today = () => new Date().toISOString().slice(0, 10);

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/dashboard", wrap(() => storage.dashboard()));

  app.get("/api/items", wrap(() => {
    const stock = storage.onHand();
    return storage.listItems().map(i => ({ ...i, onHand: +(stock.get(i.id) ?? 0).toFixed(3), rolledCost: +storage.rolledCost(i.id).toFixed(2), hasBom: storage.listBom(i.id).length > 0 }));
  }));
  app.post("/api/items", wrap(req => storage.createItem(insertItemSchema.parse(req.body))));
  app.patch("/api/items/:id", wrap(req => storage.updateItem(+req.params.id, insertItemSchema.partial().parse(req.body))));

  app.get("/api/bom/:parentId", wrap(req => storage.listBom(+req.params.parentId)));
  app.post("/api/bom", wrap(req => storage.addBomLine(insertBomLineSchema.parse(req.body))));
  app.delete("/api/bom/:id", wrap(req => storage.deleteBomLine(+req.params.id)));

  app.get("/api/warehouses", wrap(() => storage.listWarehouses()));
  app.get("/api/stock", wrap(() => storage.stockByBatch()));
  app.get("/api/txns", wrap(() => storage.listTxns()));
  app.post("/api/receipts", wrap(req => {
    const d = z.object({ itemId: z.number(), warehouseId: z.number(), qty: z.number().positive(), batchNo: z.string().nullable().optional(), ref: z.string().min(1) }).parse(req.body);
    const it = storage.getItem(d.itemId);
    if (!it) throw new ErpError("Item not found");
    if (it.tracking === "batch" && !d.batchNo) throw new ErpError("Batch number is required for this item");
    return storage.addTxn({ date: today(), itemId: d.itemId, warehouseId: d.warehouseId, qty: d.qty, txnType: "RECEIPT", ref: d.ref, batchNo: d.batchNo || null, unitCost: it.stdCost });
  }));
  app.post("/api/transfers", wrap(req => {
    const d = z.object({ itemId: z.number(), batchNo: z.string().nullable(), fromWh: z.number(), toWh: z.number(), qty: z.number().positive() }).parse(req.body);
    if (d.fromWh === d.toWh) throw new ErpError("Source and destination must differ");
    storage.transfer(d.itemId, d.batchNo, d.fromWh, d.toWh, d.qty, "TRF-" + Date.now().toString().slice(-6));
  }));

  app.get("/api/orders", wrap(() => storage.listOrders().map(o => ({ ...o, released: phase3.released(o.id), hasRouting: phase3.routing(o.itemId).length > 0 }))));
  app.get("/api/orders/:id/requirements", wrap(req => storage.orderRequirements(storage.getOrder(+req.params.id)!)));
  app.post("/api/orders", wrap(req => storage.createOrder(insertProductionOrderSchema.extend({ qty: z.number().int().positive() }).parse(req.body))));
  app.post("/api/orders/:id/start", wrap(req => storage.startOrder(+req.params.id)));
  app.post("/api/orders/:id/complete", wrap(req => { const d = completeOrderSchema.parse(req.body); return storage.completeOrder(+req.params.id, d.goodQty, d.rejectQty); }));

  app.get("/api/mrp", wrap(() => storage.mrp()));
  app.get("/api/serials", wrap(() => storage.listSerials()));
  app.get("/api/trace/serial/:sn", wrap(req => storage.traceSerial(String(req.params.sn)) ?? null));
  app.get("/api/trace/batch/:bn", wrap(req => storage.traceBatch(String(req.params.bn))));

  // ---------- Phase 2 ----------
  app.get("/api/summary", wrap(() => phase2.summary()));
  // ---------- Phase 3: MES-lite ----------
  app.get("/api/mes/stations", wrap(() => STATIONS));
  app.get("/api/mes/routings", wrap(() => phase3.routingsAll()));
  app.patch("/api/mes/routings/:itemId/:seq", wrap(req => { const d = z.object({ key: z.string(), min: z.number().nullable(), max: z.number().nullable() }).parse(req.body); return phase3.updateParam(+req.params.itemId, +req.params.seq, d.key, d.min, d.max); }));
  app.get("/api/mes/board", wrap(() => phase3.board()));
  app.get("/api/mes/queue/:station", wrap(req => phase3.queue(String(req.params.station))));
  app.get("/api/mes/unit/:serial", wrap(req => phase3.unit(String(req.params.serial)) ?? null));
  app.post("/api/mes/release/:orderId", wrap(req => phase3.releaseOrder(+req.params.orderId)));
  app.post("/api/mes/close/:orderId", wrap(req => phase3.closeOrder(+req.params.orderId)));
  app.post("/api/mes/scan", wrap(req => phase3.recordOp(z.object({ serial: z.string().min(1), station: z.string().min(1), operator: z.string(), values: z.record(z.string(), z.any()) }).parse(req.body))));
  app.post("/api/mes/disposition", wrap(req => phase3.disposition(z.object({ serial: z.string().min(1), action: z.enum(["REWORK", "SCRAP"]), reason: z.string(), operator: z.string() }).parse(req.body))));
  app.post("/api/mes/import", wrap(req => phase3.importCsv(z.object({ station: z.string().min(1), operator: z.string().min(1, "Operator is required"), csv: z.string().min(1) }).parse(req.body))));
  app.get("/api/mes/order/:id/serials", wrap(req => phase3.orderSerials(+req.params.id)));
  app.get("/api/mes/csv-template/:station", (req, res) => {
    try { const t = phase3.csvTemplate(String(req.params.station)); res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", `attachment; filename="${t.filename}"`); res.send(t.body); }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.get("/api/qc/ppap-check", wrap(req => phase3.ppapCheck(+String(req.query.customerId), String(req.query.items ?? "").split(",").filter(Boolean).map(Number))));
  app.get("/api/mes/history/:serial", wrap(req => phase3.unitHistory(String(req.params.serial))));
  // ---------- Phase 3: WMS-lite ----------
  app.get("/api/wms/bins", wrap(() => phase3.listBins()));
  app.post("/api/wms/bins", wrap(req => phase3.createBin(z.object({ code: z.string().trim().toUpperCase(), warehouseId: z.number(), zone: z.string().default("") }).parse(req.body))));
  app.get("/api/wms/bin-stock", wrap(() => phase3.binStock()));
  app.get("/api/wms/unbinned", wrap(() => phase3.unbinned()));
  app.post("/api/wms/putaway", wrap(req => phase3.putaway(z.object({ itemId: z.number(), warehouseId: z.number(), batchNo: z.string().nullable(), binId: z.number(), qty: z.number().positive() }).parse(req.body))));
  app.post("/api/wms/move", wrap(req => phase3.moveBin(z.object({ itemId: z.number(), batchNo: z.string().nullable(), fromBinId: z.number(), toBinId: z.number(), qty: z.number().positive() }).parse(req.body))));
  app.get("/api/wms/pick/order/:id", wrap(req => phase3.pickForOrder(+req.params.id)));
  app.get("/api/wms/pick/so/:id", wrap(req => phase3.pickForSo(+req.params.id)));
  app.post("/api/wms/cycle-count", wrap(req => phase3.cycleCount(z.object({ binId: z.number(), countedBy: z.string(), lines: z.array(z.object({ itemId: z.number(), batchNo: z.string().nullable(), counted: z.number() })).min(1) }).parse(req.body))));
  app.get("/api/wms/cycle-counts", wrap(() => phase3.listCycleCounts()));
  // ---------- Phase 3: Quality ----------
  app.get("/api/qc/pending", wrap(() => phase3.pendingInspection()));
  app.get("/api/qc/inspections", wrap(() => phase3.listInspections()));
  app.post("/api/qc/inspect", wrap(req => phase3.inspect(z.object({ itemId: z.number(), batchNo: z.string().nullable(), accepted: z.number(), rejected: z.number(), inspector: z.string(), checks: z.record(z.string(), z.boolean()), defect: z.string().optional() }).parse(req.body))));
  app.get("/api/qc/ncrs", wrap(() => phase3.listNcrs()));
  app.post("/api/qc/ncrs/:id/close", wrap(req => phase3.closeNcr(+req.params.id, z.object({ disposition: z.enum(["RTV", "SCRAP", "UAI"]), remarks: z.string() }).parse(req.body))));
  app.get("/api/qc/ppap", wrap(() => phase3.listPpap()));
  app.post("/api/qc/ppap", wrap(req => phase3.upsertPpap(z.object({ id: z.number().optional(), itemId: z.number(), customerId: z.number(), level: z.number().int().min(1).max(5), status: z.enum(["PENDING", "SUBMITTED", "INTERIM", "APPROVED", "REJECTED"]), submittedOn: z.string().nullable(), approvedOn: z.string().nullable(), remarks: z.string().default("") }).parse(req.body))));
  app.get("/api/phase3/summary", wrap(() => phase3.summary()));

  app.get("/api/settings", wrap(() => phase2.getSettings()));
  app.patch("/api/settings", wrap(req => phase2.updateSettings(insertSettingsSchema.partial().parse(req.body))));
  app.get("/api/parties", wrap(req => phase2.listParties(req.query.role ? String(req.query.role) : undefined)));
  app.post("/api/parties", wrap(req => phase2.createParty(insertPartySchema.parse({ ...req.body, gstin: String(req.body.gstin ?? "").toUpperCase() }))));

  app.get("/api/indents", wrap(() => phase2.listIndents()));
  app.post("/api/indents", wrap(req => { const d = z.object({ itemId: z.number(), qty: z.number().positive(), requiredBy: z.string() }).parse(req.body); return phase2.createIndent(d.itemId, d.qty, d.requiredBy); }));
  app.get("/api/pos", wrap(() => phase2.listPOs()));
  app.post("/api/pos", wrap(req => { const d = createPoSchema.parse(req.body); return phase2.createPO(d.vendorId, d.lines, d.indentIds); }));
  app.get("/api/grns", wrap(() => phase2.listGrns()));
  app.post("/api/grns", wrap(req => { const d = createGrnSchema.parse(req.body); return phase2.createGrn(d.poId, d.vendorInvoiceNo, d.lines); }));

  app.get("/api/sos", wrap(() => phase2.listSOs()));
  app.post("/api/sos", wrap(req => { const d = createSoSchema.parse(req.body); return phase2.createSO(d.customerId, d.customerPo, d.deliveryDate, d.lines); }));
  app.get("/api/invoices", wrap(() => phase2.listInvoices()));
  app.post("/api/invoices", wrap(req => { const d = createInvoiceSchema.parse(req.body); phase3.assertPpap(d.soId, d.lines); pdi.assert(d.soId, d.lines);
    return sqlite.transaction(() => { const inv = phase2.createInvoice(d.soId, d.lines, d); pdi.link(d.soId, d.lines, inv.id); return inv; })(); }));
  app.get("/api/pdi/plans", wrap(() => pdi.listPlans()));
  app.put("/api/pdi/plans/:itemId", wrap(req => pdi.savePlan({ itemId: +req.params.itemId, ...z.object({ drgRev: z.string().default("00"), drgDate: z.string().nullable(), refStandard: z.string().default(""),
    chars: z.array(z.object({ sr: z.number().default(0), description: z.string(), kind: z.enum(["num", "attr"]), nominal: z.number().nullable(), tolMinus: z.number().nullable(), tolPlus: z.number().nullable(), spec: z.string().default(""), method: z.string().default(""), unit: z.string().default("") })) }).parse(req.body) })));
  app.get("/api/pdi/pending", wrap(() => pdi.pending()));
  app.get("/api/pdi/reports", wrap(() => pdi.list()));
  app.get("/api/pdi/reports/:id", wrap(req => pdi.get(+req.params.id)));
  app.get("/api/pdi/invoice/:id", wrap(req => pdi.forInvoice(+req.params.id)));
  app.get("/api/pdi/so/:id", wrap(req => pdi.status(+req.params.id)));
  app.post("/api/pdi/reports", wrap(req => pdi.create(z.object({ soLineId: z.number(), qty: z.number().positive(), sample: z.number().int(), mtr: z.boolean(), inspector: z.string(), note: z.string().default(""),
    readings: z.array(z.object({ sr: z.number(), values: z.array(z.string()) })) }).parse(req.body))));
  app.patch("/api/invoices/:id/irn", wrap(req => phase4.recordManual("INV", +req.params.id, z.object({ irn: z.string().nullable().optional(), ackNo: z.string().nullable().optional(), ewbNo: z.string().nullable().optional() }).parse(req.body))));
  app.get("/api/invoices/:id/einvoice.json", (req, res) => {
    try {
      const doc = phase2.eInvoiceJson(+req.params.id);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="einvoice-${doc.DocDtls.No.replace(/\//g, "-")}.json"`);
      res.send(JSON.stringify([doc], null, 2));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ---------- Phase 4 ----------
  const D = (v: any, def: string) => String(v ?? def);
  const t0 = () => new Date().toISOString().slice(0, 10);
  const back = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  app.get("/api/p4/meta", wrap(() => ({ crnReasons: CRN_REASONS, dbnReasons: DBN_REASONS, downtimeReasons: DOWNTIME_REASONS, cancelReasons: CANCEL_REASONS, kinds: KIND_LABEL, stations: STATIONS })));
  app.get("/api/p4/config", wrap(() => ({ ...phase4.cfg(), live: phase4.liveStatus() })));
  app.put("/api/p4/config", wrap(req => phase4.saveCfg(z.object({ gspMode: z.enum(["SIMULATED", "LIVE"]), gspProvider: z.string(), gspEnv: z.enum(["SANDBOX", "PRODUCTION"]), aatoAbove5Cr: z.coerce.number(), aato10Cr: z.coerce.number(), plannedMin: z.number().int().min(60).max(1440) }).partial().parse(req.body))));
  // job work outward
  const jwLine = z.object({ itemId: z.number().nullable(), description: z.string().optional(), hsn: z.string().optional(), uom: z.string().optional(), qty: z.number(), rate: z.number().nullable().optional(), kind: z.enum(["INPUT", "CAPITAL", "TOOL"]), batchNo: z.string().nullable().optional() });
  app.get("/api/jw/challans", wrap(() => phase4.listChallans()));
  app.get("/api/jw/challans/:id", wrap(req => ({ ...phase4.getChallan(+req.params.id), company: phase2.getSettings() })));
  app.post("/api/jw/challans", wrap(req => phase4.createChallan(z.object({ jobworkerId: z.number(), process: z.string(), expectedReturn: z.string().nullable(), vehicleNo: z.string().nullable(), transporter: z.string().nullable(), distanceKm: z.number().nullable(), note: z.string().optional(), lines: z.array(jwLine) }).parse(req.body))));
  app.post("/api/jw/challans/:id/receive", wrap(req => phase4.receiveBack({ challanId: +req.params.id, ...z.object({ jwChallanNo: z.string(), jwChallanDate: z.string().nullable(), note: z.string().optional(), lines: z.array(z.object({ lineId: z.number(), qty: z.number(), lossQty: z.number() })) }).parse(req.body) })));
  app.post("/api/jw/lines/:id/deemed", wrap(req => phase4.deemedSupply(+req.params.id)));
  app.get("/api/jw/deemed", wrap(() => phase4.listDeemed()));
  app.get("/api/jw/itc04", wrap(req => phase4.itc04(D(req.query.fy, "26-27"), D(req.query.period, "H1"))));
  app.get("/api/jw/itc04.csv", (req, res) => {
    try { const tb = req.query.table === "5A" ? "5A" : "4"; res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", `attachment; filename="ITC-04_${D(req.query.fy, "26-27")}_${D(req.query.period, "H1")}_table${tb}.csv"`);
      res.send(phase4.itc04Csv(D(req.query.fy, "26-27"), D(req.query.period, "H1"), tb)); } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  // job work inward
  app.get("/api/jw/inward", wrap(() => phase4.listInward()));
  app.post("/api/jw/inward", wrap(req => phase4.createInward(z.object({ principalId: z.number(), principalChallanNo: z.string(), principalChallanDate: z.string(), process: z.string(), chargeRate: z.number().min(0), lines: z.array(z.object({ description: z.string(), hsn: z.string(), uom: z.string(), qty: z.number(), value: z.number().min(0) })) }).parse(req.body))));
  app.post("/api/jw/inward/:id/return", wrap(req => phase4.returnInward({ receiptId: +req.params.id, ...z.object({ sac: z.string(), chargeRate: z.number().positive(), gstRate: z.number(), vehicleNo: z.string().nullable(), lines: z.array(z.object({ idx: z.number(), qty: z.number(), scrapQty: z.number() })) }).parse(req.body) })));
  app.get("/api/jw/returns/:id", wrap(req => ({ ...phase4.getReturn(+req.params.id), company: phase2.getSettings() })));
  // notes
  app.get("/api/notes", wrap(() => phase4.listNotes()));
  app.get("/api/notes/:id", wrap(req => ({ ...phase4.getNote(+req.params.id), company: phase2.getSettings() })));
  app.get("/api/invoices/:id/notes", wrap(req => phase4.notesForInvoice(+req.params.id)));
  app.get("/api/invoices/:id/headroom", wrap(req => ({ lines: phase4.noteHeadroom(+req.params.id), crnDeadline: phase4.crnDeadline(phase2.getInvoice(+req.params.id)!.date) })));
  app.post("/api/notes", wrap(req => phase4.createNote(z.object({ typ: z.enum(["CRN", "DBN"]), invoiceId: z.number(), reason: z.string(), lines: z.array(z.object({ idx: z.number(), qty: z.number(), rate: z.number(), serials: z.array(z.string()).optional() })) }).parse(req.body))));
  app.post("/api/invoices/:id/void", wrap(req => phase4.voidInvoice(+req.params.id)));
  // GST portal
  const DT = z.enum(["INV", "CRN", "DBN", "JWI", "JWO"]);
  app.get("/api/gsp/:type/:id", wrap(req => phase4.edocView(DT.parse(req.params.type), +req.params.id)));
  app.get("/api/gsp/:type/:id/json", wrap(req => phase4.docJson(DT.parse(req.params.type), +req.params.id).json));
  app.post("/api/gsp/:type/:id/irn", wrap(req => phase4.generateIrn(DT.parse(req.params.type), +req.params.id)));
  app.post("/api/gsp/:type/:id/cancel-irn", wrap(req => { const b = z.object({ reason: z.string(), remark: z.string().default("") }).parse(req.body); return phase4.cancelIrn(DT.parse(req.params.type), +req.params.id, b.reason, b.remark); }));
  app.post("/api/gsp/:type/:id/ewb", wrap(req => phase4.generateEwb(DT.parse(req.params.type), +req.params.id, z.object({ vehicleNo: z.string(), transporter: z.string().nullable(), distanceKm: z.number() }).parse(req.body))));
  app.post("/api/gsp/:type/:id/cancel-ewb", wrap(req => phase4.cancelEwb(DT.parse(req.params.type), +req.params.id)));
  app.get("/api/gsp-log", wrap(() => phase4.listLog()));
  // dashboards
  app.get("/api/analytics/overview", wrap(() => phase4.overview()));
  app.get("/api/analytics/oee", wrap(req => phase4.oee(D(req.query.from, back(14)), D(req.query.to, t0()))));
  app.get("/api/analytics/fpy", wrap(req => phase4.fpy(D(req.query.from, back(30)), D(req.query.to, t0()))));
  app.get("/api/analytics/order-book", wrap(() => phase4.orderBook()));
  app.get("/api/analytics/ageing", wrap(() => phase4.inventoryAgeing()));
  app.get("/api/analytics/downtime", wrap(req => phase4.listDowntime(D(req.query.from, back(14)), D(req.query.to, t0()))));
  app.post("/api/analytics/downtime", wrap(req => phase4.logDowntime(z.object({ date: z.string(), station: z.string(), minutes: z.number(), reason: z.string(), note: z.string().default("") }).parse(req.body))));

  app.get("/api/tally/preview", wrap(req => phase2.tallyXml(String(req.query.from ?? "2000-01-01"), String(req.query.to ?? "2999-12-31"))));
  app.get("/api/tally/vouchers.xml", (req, res) => {
    const { xml } = phase2.tallyXml(String(req.query.from ?? "2000-01-01"), String(req.query.to ?? "2999-12-31"));
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="tally-vouchers-${req.query.from ?? "all"}-to-${req.query.to ?? "all"}.xml"`);
    res.send(xml);
  });
  return httpServer;
}
