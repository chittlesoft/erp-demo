// Shared types, constants and helpers used by both API routes and the client.

export const PRODUCT_LINES = ["NOx", "EGTS", "UQS", "DeltaP", "Lambda"] as const;
export const ITEM_TYPES = ["RM", "SFG", "FG", "CONSUMABLE"] as const;
export const TRACKING = ["none", "batch", "serial"] as const;
export const UOMS = ["NOS", "MTR", "KG", "LTR", "SET"] as const;

export const STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana",
  "37": "Andhra Pradesh",
};

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GSTN mod-36 check character for the first 14 characters of a GSTIN */
export function gstinCheckChar(first14: string) {
  const cs = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = cs.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return cs[(36 - (sum % 36)) % 36];
}

export function validGstin(g: string): boolean {
  return GSTIN_RE.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14];
}

export const PREFIX: Record<string, string> = {
  NOx: "NOX", EGTS: "EGT", UQS: "UQS", DeltaP: "DPS", Lambda: "LMB",
};

export const LINE_LABEL: Record<string, string> = {
  NOx: "NOx", EGTS: "EGTS", UQS: "UQS", DeltaP: "Delta P", Lambda: "Lambda",
};

export const TYPE_LABEL: Record<string, string> = {
  RM: "Raw material", SFG: "Sub-assembly", FG: "Finished good", CONSUMABLE: "Consumable",
};

// ---------- Domain types (returned by the API) ----------
export type ItemRow = {
  id: number; code: string; name: string; type: string; productLine: string | null;
  hsn: string; gstRate: number; uom: string; tracking: string; reorderLevel: number;
  stdCost: number; customerPartNo: string | null; specs: string | null;
  onHand: number; rolledCost: number; hasBom: boolean;
};

export type StockRow = { itemId: number; warehouseId: number; batchNo: string | null; qty: number; firstId: number };
export type Requirement = {
  itemId: number; code: string; name: string; uom: string;
  required: number; available: number; shortage: number;
};
export type Dashboard = {
  itemCount: number; stockValue: number; openOrders: number; inProgress: number;
  unitsGood: number; unitsRejected: number; fpy: number | null;
  lowStock: { id: number; code: string; name: string; uom: string; onHand: number; reorderLevel: number }[];
  byLine: { line: string; good: number; reject: number }[];
};

export type Summary = {
  orderBook: number; openSOs: number; overdue: number; salesMtd: number;
  irnPending: number; openIndents: number; openPOs: number;
};

export type InvoiceLine = {
  soLineId: number; itemId: number; code: string; name: string; hsn: string;
  uom: string; qty: number; rate: number; taxable: number; gstRate: number;
  cgst: number; sgst: number; igst: number; serials: string[]; customerPartNo: string | null;
};

export type Phase3Summary = {
  wip: number; hold: number; fpyToday: number | null;
  pendingIqc: number; openNcrs: number; unbinned: number; ppapPending: number;
};

// ---------- Formatting helpers ----------
export const today = () => new Date().toISOString().slice(0, 10);
export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const inr2 = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

/** Indian-FY document number, e.g. INV/26-27/0001 (≤16 chars) */
export function fyNo(prefix: string, n: number, date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const yy = (m >= 4 ? y : y - 1).toString().slice(2);
  const yy2 = (m >= 4 ? y + 1 : y).toString().slice(2);
  return `${prefix}/${yy}-${yy2}/${String(n).padStart(4, "0")}`;
}

/** Rupees in words, Indian numbering (lakh / crore) */
export function amountInWords(n: number): string {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""));
  const three = (x: number) => (x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + two(x % 100) : "") : two(x));
  let r = Math.round(n);
  if (!r) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7); r %= 1e7;
  const lakh = Math.floor(r / 1e5); r %= 1e5;
  const th = Math.floor(r / 1e3); r %= 1e3;
  if (crore) parts.push(three(crore) + " Crore");
  if (lakh) parts.push(two(lakh) + " Lakh");
  if (th) parts.push(two(th) + " Thousand");
  if (r) parts.push(three(r));
  return "Rupees " + parts.join(" ") + " Only";
}

export function roundQty(q: number, uom: string) {
  return uom === "NOS" ? Math.ceil(q - 1e-9) : +q.toFixed(3);
}

/** Prototype-only realistic EOL placeholder values. Production version imports real test-bench data. */
export function simulatedEol(line: string | null, pass: boolean): Record<string, string> {
  const r = (a: number, b: number, d = 2) => (a + Math.random() * (b - a)).toFixed(d);
  const bad = (ok: string, ng: string) => (pass ? ok : ng + " (out of spec)");
  switch (line) {
    case "NOx":
      return {
        "NOx offset (ppm)": bad(r(-8, 8, 1), r(14, 22, 1)),
        "O2 signal (%)": r(20.6, 21.2),
        "Heater current (A)": r(1.1, 1.4),
        "CAN comm": "OK",
      };
    case "EGTS":
      return {
        "Resistance @25°C (Ω)": bad(r(0.95, 1.05, 3), r(1.12, 1.25, 3)),
        "Accuracy @600°C (±°C)": r(1.2, 3.8, 1),
        "Insulation (MΩ)": r(110, 400, 0),
      };
    case "UQS":
      return {
        "Concentration (% AdBlue)": bad(r(31.8, 33.2, 1), r(28.0, 30.5, 1)),
        "Level accuracy (mm)": r(0.5, 2.5, 1),
        "Temp (°C)": r(24, 26, 1),
      };
    case "DeltaP":
      return {
        "Span error (% FS)": bad(r(0.2, 1.4), r(2.1, 3.5)),
        "Zero offset (kPa)": r(-0.3, 0.3),
        "Output @50 kPa (V)": r(2.48, 2.52, 3),
      };
    case "Lambda":
      return {
        "Lambda @ λ=1": bad(r(0.995, 1.005, 3), r(1.012, 1.03, 3)),
        "Ip pump current (mA)": r(-0.05, 0.05, 3),
        "Heater R (Ω)": r(3.0, 3.6),
      };
    default:
      return {};
  }
}

export class ErpError extends Error {
  status = 400;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}
