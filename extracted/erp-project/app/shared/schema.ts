import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const PRODUCT_LINES = ["NOx", "EGTS", "UQS", "DeltaP", "Lambda"] as const;
export const ITEM_TYPES = ["RM", "SFG", "FG", "CONSUMABLE"] as const;
export const TRACKING = ["none", "batch", "serial"] as const;

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // RM | SFG | FG | CONSUMABLE
  productLine: text("product_line"), // for FG/SFG
  hsn: text("hsn").notNull(),
  gstRate: real("gst_rate").notNull().default(18),
  uom: text("uom").notNull().default("NOS"),
  tracking: text("tracking").notNull().default("none"),
  reorderLevel: real("reorder_level").notNull().default(0),
  stdCost: real("std_cost").notNull().default(0),
  customerPartNo: text("customer_part_no"),
  specs: text("specs"),
});
export const insertItemSchema = createInsertSchema(items).omit({ id: true });
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof items.$inferSelect;

export const bomLines = sqliteTable("bom_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentItemId: integer("parent_item_id").notNull(),
  componentItemId: integer("component_item_id").notNull(),
  qty: real("qty").notNull(),
  scrapPct: real("scrap_pct").notNull().default(0),
  version: text("version").notNull().default("A"),
});
export const insertBomLineSchema = createInsertSchema(bomLines).omit({ id: true });
export type InsertBomLine = z.infer<typeof insertBomLineSchema>;
export type BomLine = typeof bomLines.$inferSelect;

export const warehouses = sqliteTable("warehouses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});
export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true });
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Warehouse = typeof warehouses.$inferSelect;

// Stock ledger: every movement is a row (+ in / - out)
export const stockTxns = sqliteTable("stock_txns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  itemId: integer("item_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  qty: real("qty").notNull(),
  txnType: text("txn_type").notNull(), // RECEIPT | ISSUE | PROD_OUT | ADJUST
  ref: text("ref"),
  batchNo: text("batch_no"),
  unitCost: real("unit_cost").notNull().default(0),
});
export const insertStockTxnSchema = createInsertSchema(stockTxns).omit({ id: true });
export type InsertStockTxn = z.infer<typeof insertStockTxnSchema>;
export type StockTxn = typeof stockTxns.$inferSelect;

export const productionOrders = sqliteTable("production_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(),
  itemId: integer("item_id").notNull(),
  qty: real("qty").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("PLANNED"), // PLANNED | IN_PROGRESS | COMPLETED
  warehouseId: integer("warehouse_id").notNull(),
  goodQty: real("good_qty").notNull().default(0),
  rejectQty: real("reject_qty").notNull().default(0),
  consumedBatches: text("consumed_batches").notNull().default("[]"), // JSON [{itemId, batchNo, qty}]
});
export const insertProductionOrderSchema = createInsertSchema(productionOrders).pick({
  itemId: true, qty: true, dueDate: true, warehouseId: true,
});
export type InsertProductionOrder = z.infer<typeof insertProductionOrderSchema>;
export type ProductionOrder = typeof productionOrders.$inferSelect;

export const serials = sqliteTable("serials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serialNo: text("serial_no").notNull().unique(),
  itemId: integer("item_id").notNull(),
  productionOrderId: integer("production_order_id").notNull(),
  eolResult: text("eol_result").notNull(), // PASS | FAIL
  eolData: text("eol_data").notNull().default("{}"),
  date: text("date").notNull(),
  status: text("status").notNull().default("IN_STOCK"), // IN_STOCK | DISPATCHED | REJECTED
  invoiceId: integer("invoice_id"),
});
export type Serial = typeof serials.$inferSelect;

export const completeOrderSchema = z.object({
  goodQty: z.number().int().min(0),
  rejectQty: z.number().int().min(0),
});

// ================= Phase 2: Parties, Purchase, Sales & GST =================
export const STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
  "23": "Madhya Pradesh", "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana", "37": "Andhra Pradesh",
};
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** GSTN mod-36 check character for the first 14 characters of a GSTIN */
export function gstinCheckChar(first14: string) {
  const cs = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) { const p = cs.indexOf(first14[i]) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); }
  return cs[(36 - (sum % 36)) % 36];
}

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  legalName: text("legal_name").notNull(),
  gstin: text("gstin").notNull(),
  stateCode: text("state_code").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  pincode: text("pincode").notNull(),
  cin: text("cin").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  plantAddress: text("plant_address").notNull().default(""),
  plantCity: text("plant_city").notNull().default(""),
  plantPincode: text("plant_pincode").notNull().default(""),
  certifications: text("certifications").notNull().default(""),
  tallyCompany: text("tally_company").notNull(),
  salesLedger: text("sales_ledger").notNull(),
  purchaseLedger: text("purchase_ledger").notNull(),
});
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true }).extend({
  gstin: z.string().regex(GSTIN_RE, "Invalid GSTIN format").or(z.literal("")),
  pincode: z.string().regex(/^\d{6}$/, "6-digit PIN"),
});
export type Settings = typeof settings.$inferSelect;

export const parties = sqliteTable("parties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(), // CUSTOMER | VENDOR | JOBWORKER
  gstin: text("gstin").notNull(),
  stateCode: text("state_code").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  pincode: text("pincode").notNull(),
  distanceKm: integer("distance_km").notNull().default(0),
});
export const insertPartySchema = createInsertSchema(parties).omit({ id: true }).extend({
  gstin: z.string().regex(GSTIN_RE, "Invalid GSTIN format").refine(g => gstinCheckChar(g.slice(0, 14)) === g[14], "GSTIN check digit (15th character) is wrong — re-check the number"),
  pincode: z.string().regex(/^\d{6}$/, "6-digit PIN"),
});
export type InsertParty = z.infer<typeof insertPartySchema>;
export type Party = typeof parties.$inferSelect;

export const indents = sqliteTable("indents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  indentNo: text("indent_no").notNull().unique(),
  itemId: integer("item_id").notNull(),
  qty: real("qty").notNull(),
  requiredBy: text("required_by").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | ORDERED
  poId: integer("po_id"),
});
export type Indent = typeof indents.$inferSelect;

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poNo: text("po_no").notNull().unique(),
  vendorId: integer("vendor_id").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | PARTIAL | CLOSED
});
export const poLines = sqliteTable("po_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poId: integer("po_id").notNull(),
  itemId: integer("item_id").notNull(),
  qty: real("qty").notNull(),
  rate: real("rate").notNull(),
  receivedQty: real("received_qty").notNull().default(0),
});
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PoLine = typeof poLines.$inferSelect;

export const grns = sqliteTable("grns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  grnNo: text("grn_no").notNull().unique(),
  poId: integer("po_id").notNull(),
  date: text("date").notNull(),
  vendorInvoiceNo: text("vendor_invoice_no").notNull(),
  lines: text("lines").notNull(), // JSON [{poLineId,itemId,qty,rate,batchNo}]
  taxable: real("taxable").notNull(),
  cgst: real("cgst").notNull(), sgst: real("sgst").notNull(), igst: real("igst").notNull(),
  total: real("total").notNull(),
});
export type Grn = typeof grns.$inferSelect;

export const salesOrders = sqliteTable("sales_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  soNo: text("so_no").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  customerPo: text("customer_po").notNull(),
  date: text("date").notNull(),
  deliveryDate: text("delivery_date").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | PARTIAL | CLOSED
});
export const soLines = sqliteTable("so_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  soId: integer("so_id").notNull(),
  itemId: integer("item_id").notNull(),
  qty: real("qty").notNull(),
  rate: real("rate").notNull(),
  dispatchedQty: real("dispatched_qty").notNull().default(0),
});
export type SalesOrder = typeof salesOrders.$inferSelect;
export type SoLine = typeof soLines.$inferSelect;

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invNo: text("inv_no").notNull().unique(),
  soId: integer("so_id").notNull(),
  customerId: integer("customer_id").notNull(),
  date: text("date").notNull(),
  placeOfSupply: text("place_of_supply").notNull(),
  lines: text("lines").notNull(), // JSON InvoiceLine[]
  taxable: real("taxable").notNull(),
  cgst: real("cgst").notNull(), sgst: real("sgst").notNull(), igst: real("igst").notNull(),
  roundOff: real("round_off").notNull().default(0),
  total: real("total").notNull(),
  vehicleNo: text("vehicle_no"),
  transporter: text("transporter"),
  distanceKm: integer("distance_km").notNull().default(0),
  irn: text("irn"),
  ackNo: text("ack_no"),
  ewbNo: text("ewb_no"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | CANCELLED
});
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = { soLineId: number; itemId: number; code: string; name: string; hsn: string; uom: string; qty: number; rate: number; taxable: number; gstRate: number; cgst: number; sgst: number; igst: number; serials: string[]; customerPartNo: string | null };

export const createPoSchema = z.object({
  vendorId: z.number(), indentIds: z.array(z.number()).default([]),
  lines: z.array(z.object({ itemId: z.number(), qty: z.number().positive(), rate: z.number().positive() })).min(1, "Add at least one line"),
});
export const createGrnSchema = z.object({
  poId: z.number(), vendorInvoiceNo: z.string().min(1, "Vendor invoice no. required"),
  lines: z.array(z.object({ poLineId: z.number(), qty: z.number().min(0), batchNo: z.string().nullable() })),
});
export const createSoSchema = z.object({
  customerId: z.number(), customerPo: z.string().min(1, "Customer PO required"), deliveryDate: z.string(),
  lines: z.array(z.object({ itemId: z.number(), qty: z.number().int().positive(), rate: z.number().positive() })).min(1, "Add at least one line"),
});
export const createInvoiceSchema = z.object({
  soId: z.number(),
  lines: z.array(z.object({ soLineId: z.number(), qty: z.number().int().min(0) })),
  vehicleNo: z.string().nullable(), transporter: z.string().nullable(), distanceKm: z.number().int().min(0),
});
