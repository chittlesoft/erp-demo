// Phase 2 service: Parties, Purchase (indent→PO→GRN), Sales (SO→dispatch→invoice).
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ErpError, fyNo, today, validGstin, type InvoiceLine } from "./shared";

// ---------- Parties ----------
export async function listParties(role?: string) {
  return role ? db.party.findMany({ where: { role }, orderBy: { name: "asc" } }) : db.party.findMany({ orderBy: { name: "asc" } });
}
export async function createParty(d: Prisma.PartyUncheckedCreateInput) {
  d.code = String(d.code).toUpperCase();
  if (!validGstin(d.gstin)) throw new ErpError("Invalid GSTIN — check format or the 15th check digit");
  const stateFromGstin = d.gstin.slice(0, 2);
  if (d.stateCode !== stateFromGstin) throw new ErpError(`GSTIN state code (${stateFromGstin}) does not match the selected state`);
  return db.party.create({ data: d });
}
export async function updateParty(id: number, d: Prisma.PartyUncheckedUpdateInput) {
  if (typeof d.gstin === "string" && d.gstin && !validGstin(d.gstin)) throw new ErpError("Invalid GSTIN");
  return db.party.update({ where: { id }, data: d });
}

// ---------- Indents ----------
export async function listIndents() {
  return db.indent.findMany({ orderBy: { id: "desc" }, include: { item: true } });
}
export async function createIndent(d: { itemId: number; qty: number; requiredBy: string }) {
  const n = await db.indent.count() + 1;
  return db.indent.create({ data: { ...d, indentNo: fyNo("IND", n), status: "OPEN" } });
}

// ---------- Purchase orders ----------
export async function listPOs() {
  return db.purchaseOrder.findMany({ orderBy: { id: "desc" }, include: { vendor: true, lines: { include: { item: true } }, grns: true } });
}
export async function createPO(d: { vendorId: number; indentIds?: number[]; lines: { itemId: number; qty: number; rate: number }[] }) {
  if (!d.lines.length) throw new ErpError("Add at least one line");
  const n = await db.purchaseOrder.count() + 1;
  const poNo = fyNo("PO", n);
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({ data: { poNo, vendorId: d.vendorId, date: today(), status: "OPEN" } });
    for (const l of d.lines) await tx.poLine.create({ data: { poId: po.id, itemId: l.itemId, qty: l.qty, rate: l.rate } });
    if (d.indentIds?.length) await tx.indent.updateMany({ where: { id: { in: d.indentIds } }, data: { status: "ORDERED", poId: po.id } });
    return po;
  });
}

// ---------- GRN ----------
export async function listGrns() {
  return db.grn.findMany({ orderBy: { id: "desc" }, include: { po: { include: { vendor: true } } } });
}
export async function createGrn(d: { poId: number; vendorInvoiceNo: string; lines: { poLineId: number; qty: number; batchNo: string | null }[] }) {
  const po = await db.purchaseOrder.findUnique({ where: { id: d.poId }, include: { lines: true, vendor: true } });
  if (!po) throw new ErpError("PO not found");
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const intra = po.vendor.stateCode === (settings?.stateCode ?? "27");
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const lineData: { poLineId: number; itemId: number; qty: number; rate: number; batchNo: string | null }[] = [];
  await db.$transaction(async (tx) => {
    const grnNo = fyNo("GRN", (await db.grn.count()) + 1);
    const qcWh = await db.warehouse.findFirst({ where: { code: "QC" } });
    if (!qcWh) throw new ErpError("QC warehouse missing");
    for (const l of d.lines) {
      if (!l.qty) continue;
      const pl = po.lines.find(x => x.id === l.poLineId);
      if (!pl) throw new ErpError("Invalid PO line");
      if (pl.tracking === "batch" && !l.batchNo) throw new ErpError(`Batch no. required for ${pl.itemId}`);
      const item = await tx.item.findUnique({ where: { id: pl.itemId } });
      if (item?.tracking === "batch" && !l.batchNo) throw new ErpError(`Batch no. required for ${item.code}`);
      const amt = l.qty * pl.rate;
      const gst = amt * item!.gstRate / 100;
      taxable += amt;
      if (intra) { cgst += gst / 2; sgst += gst / 2; } else igst += gst;
      lineData.push({ poLineId: l.poLineId, itemId: pl.itemId, qty: l.qty, rate: pl.rate, batchNo: l.batchNo });
      // stock into QC quarantine
      await tx.stockTxn.create({ data: { date: today(), itemId: pl.itemId, warehouseId: qcWh.id, qty: l.qty, txnType: "RECEIPT", ref: grnNo, batchNo: l.batchNo, unitCost: pl.rate } });
      await tx.poLine.update({ where: { id: l.poLineId }, data: { receivedQty: { increment: l.qty } } });
    }
    await tx.grn.create({ data: { grnNo, poId: po.id, date: today(), vendorInvoiceNo: d.vendorInvoiceNo, lines: JSON.stringify(lineData), taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst } });
    // update PO status
    const refreshed = await tx.purchaseOrder.findUnique({ where: { id: po.id }, include: { lines: true } });
    const allDone = refreshed!.lines.every(l => l.receivedQty >= l.qty - 1e-9);
    const any = refreshed!.lines.some(l => l.receivedQty > 0);
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: allDone ? "CLOSED" : any ? "PARTIAL" : "OPEN" } });
  });
  return { taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
}

// ---------- Sales orders ----------
export async function listSOs() {
  return db.salesOrder.findMany({ orderBy: { id: "desc" }, include: { customer: true, lines: { include: { item: true } }, invoices: true } });
}
export async function createSO(d: { customerId: number; customerPo: string; deliveryDate: string; lines: { itemId: number; qty: number; rate: number }[] }) {
  if (!d.lines.length) throw new ErpError("Add at least one line");
  if (!d.customerPo.trim()) throw new ErpError("Customer PO required");
  const n = await db.salesOrder.count() + 1;
  return db.$transaction(async (tx) => {
    const so = await tx.salesOrder.create({ data: { soNo: fyNo("SO", n), customerId: d.customerId, customerPo: d.customerPo, date: today(), deliveryDate: d.deliveryDate, status: "OPEN" } });
    for (const l of d.lines) await tx.soLine.create({ data: { soId: so.id, itemId: l.itemId, qty: l.qty, rate: l.rate } });
    return so;
  });
}

// ---------- Invoices ----------
export async function listInvoices() {
  return db.invoice.findMany({ orderBy: { id: "desc" }, include: { customer: true, so: true } });
}
export async function getInvoice(id: number) {
  return db.invoice.findUnique({ where: { id }, include: { customer: true, so: { include: { lines: { include: { item: true } } } } } });
}

export async function createInvoice(d: { soId: number; lines: { soLineId: number; qty: number }[]; vehicleNo: string | null; transporter: string | null; distanceKm: number }) {
  const so = await db.salesOrder.findUnique({ where: { id: d.soId }, include: { lines: { include: { item: true } }, customer: true } });
  if (!so) throw new ErpError("Sales order not found");
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const intra = so.customer.stateCode === (settings?.stateCode ?? "27");
  const fgWh = await db.warehouse.findFirst({ where: { code: "FG" } });
  if (!fgWh) throw new ErpError("FG warehouse missing");

  const invLines: InvoiceLine[] = [];
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const allocatedSerials: { serialNo: string; itemId: number }[] = [];

  await db.$transaction(async (tx) => {
    for (const l of d.lines) {
      if (!l.qty) continue;
      const sl = so.lines.find(x => x.id === l.soLineId);
      if (!sl) throw new ErpError("Invalid SO line");
      const remaining = sl.qty - sl.dispatchedQty;
      if (l.qty > remaining + 1e-9) throw new ErpError(`Cannot dispatch more than pending (${remaining}) for ${sl.item.code}`);
      const serials = sl.item.tracking === "serial"
        ? await tx.serial.findMany({ where: { itemId: sl.itemId, status: "IN_STOCK", invoiceId: null }, orderBy: { id: "asc" }, take: l.qty })
        : [];
      if (sl.item.tracking === "serial" && serials.length < l.qty) throw new ErpError(`Only ${serials.length} IN_STOCK serials available for ${sl.item.code} (${l.qty} needed)`);
      const amt = l.qty * sl.rate;
      const gst = amt * sl.item.gstRate / 100;
      taxable += amt;
      if (intra) { cgst += gst / 2; sgst += gst / 2; } else igst += gst;
      invLines.push({
        soLineId: sl.id, itemId: sl.itemId, code: sl.item.code, name: sl.item.name, hsn: sl.item.hsn, uom: sl.item.uom,
        qty: l.qty, rate: sl.rate, taxable: amt, gstRate: sl.item.gstRate,
        cgst: intra ? gst / 2 : 0, sgst: intra ? gst / 2 : 0, igst: intra ? 0 : gst,
        serials: serials.map(s => s.serialNo), customerPartNo: sl.item.customerPartNo,
      });
      for (const s of serials) allocatedSerials.push({ serialNo: s.serialNo, itemId: sl.itemId });
      // reduce FG stock
      await tx.stockTxn.create({ data: { date: today(), itemId: sl.itemId, warehouseId: fgWh.id, qty: -l.qty, txnType: "ISSUE", ref: "INV", batchNo: null, unitCost: sl.rate } });
      await tx.soLine.update({ where: { id: sl.id }, data: { dispatchedQty: { increment: l.qty } } });
    }
    if (!invLines.length) throw new ErpError("Nothing to invoice");
    const total = taxable + cgst + sgst + igst;
    const invNo = fyNo("INV", (await db.invoice.count()) + 1);
    const inv = await tx.invoice.create({ data: { invNo, soId: so.id, customerId: so.customerId, date: today(), placeOfSupply: so.customer.stateCode, lines: JSON.stringify(invLines), taxable, cgst, sgst, igst, roundOff: 0, total, vehicleNo: d.vehicleNo, transporter: d.transporter, distanceKm: d.distanceKm, status: "ACTIVE" } });
    for (const s of allocatedSerials) await tx.serial.update({ where: { serialNo: s.serialNo }, data: { invoiceId: inv.id, status: "DISPATCHED" } });
    // SO status
    const refreshed = await tx.salesOrder.findUnique({ where: { id: so.id }, include: { lines: true } });
    const allDone = refreshed!.lines.every(l => l.dispatchedQty >= l.qty - 1e-9);
    const any = refreshed!.lines.some(l => l.dispatchedQty > 0);
    await tx.salesOrder.update({ where: { id: so.id }, data: { status: allDone ? "CLOSED" : any ? "PARTIAL" : "OPEN" } });
  });
  return { taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
}

export async function recordIrn(id: number, d: { irn: string; ackNo: string; ewbNo?: string | null }) {
  return db.invoice.update({ where: { id }, data: { irn: d.irn, ackNo: d.ackNo, ewbNo: d.ewbNo ?? null } });
}

// ---------- Tally export (view-only voucher JSON) ----------
export async function tallyExport(from: string, to: string) {
  const invs = await db.invoice.findMany({ where: { date: { gte: from, lte: to }, status: "ACTIVE" } });
  const grns = await db.grn.findMany({ where: { date: { gte: from, lte: to } }, include: { po: { include: { vendor: true } } } });
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  return {
    company: settings?.tallyCompany ?? "Tau Power Electronics",
    from, to,
    sales: invs.map(i => {
      const lines = JSON.parse(i.lines) as InvoiceLine[];
      return {
        voucher: "Sales", date: i.date, invNo: i.invNo, party: invs.find(() => true),
        taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total,
        lineItems: lines.map(l => ({ item: l.code, qty: l.qty, rate: l.rate, taxable: l.taxable })),
      };
    }),
    purchase: grns.map(g => {
      const lines = JSON.parse(g.lines) as { itemId: number; qty: number; rate: number }[];
      return { voucher: "Purchase", date: g.date, grnNo: g.grnNo, vendorInvoiceNo: g.vendorInvoiceNo, party: g.po.vendor.name, taxable: g.taxable, cgst: g.cgst, sgst: g.sgst, igst: g.igst, total: g.total, lineItems: lines.map(l => ({ qty: l.qty, rate: l.rate })) };
    }),
  };
}
