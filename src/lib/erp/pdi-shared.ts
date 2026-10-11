// Client-safe PDI types + pure helpers (no Prisma/db imports).
// Server logic lives in `./pdi` and re-uses these.

export type PdiChar = {
  sr: number;
  description: string;
  kind: "num" | "attr";
  nominal: number | null;
  tolMinus: number | null;
  tolPlus: number | null;
  spec: string;
  method: string;
  unit: string;
};

export type PdiPlan = {
  itemId: number;
  drgRev: string;
  drgDate: string | null;
  refStandard: string;
  chars: PdiChar[];
};

export type PdiReading = { sr: number; values: string[]; ok: boolean };

export type PdiReportDetail = {
  id: number;
  pdiNo: string;
  date: string;
  soId: number;
  soNo: string;
  soLineId: number;
  customerId: number;
  customer: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  customerPartNo: string | null;
  qty: number;
  sample: number;
  drgRev: string;
  drgDate: string | null;
  refStandard: string;
  mtr: boolean;
  chars: PdiChar[];
  readings: PdiReading[];
  result: "ACCEPT" | "REJECT";
  inspector: string;
  note: string;
  invoiceId: number | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
};

export type PendingRow = {
  soId: number;
  soNo: string;
  soLineId: number;
  customerId: number;
  customer: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  customerPartNo: string | null;
  pending: number;
  fgStock: number;
  covered: number;
  toInspect: number;
};

export type PlanRow = {
  itemId: number;
  code: string;
  name: string;
  customerPartNo: string | null;
  plan: PdiPlan | null;
};

export type CreateReportInput = {
  soLineId: number;
  qty: number;
  sample: number;
  mtr: boolean;
  inspector: string;
  note: string;
  readings: { sr: number; values: string[] }[];
};

// ---------- spec helpers ----------
export function specText(c: PdiChar): string {
  if (c.kind === "attr") return c.spec;
  if (c.nominal == null) return c.spec;
  const m = c.tolMinus ?? 0;
  const p = c.tolPlus ?? 0;
  return m === p ? `${c.nominal}±${p}` : `${c.nominal} +${p}/-${m}`;
}

/** null = empty (not yet filled), true = in spec, false = out of spec. */
export function charOk(c: PdiChar, v: string): boolean | null {
  const s = (v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (c.kind === "attr") return ["OK", "GO", "PASS", "Y", "YES", "1"].includes(s);
  const n = Number(s);
  if (!Number.isFinite(n) || c.nominal == null) return false;
  return n >= c.nominal - (c.tolMinus ?? 0) - 1e-9 && n <= c.nominal + (c.tolPlus ?? 0) + 1e-9;
}

/** DD-MM-YYYY for display (the Tau Power PDI format prints dates that way). */
export const dmy = (d: string | null) => (d ? d.split("-").reverse().join("-") : "");

export const PDI_DOC = "Document No: TPE/IMS/FR/78, Rev. No:01, Rev. Date: 23.09.2026";
