// Pre-Dispatch Inspection (PDI) — mirrors Tau Power format TPE/IMS/FR/78 Rev 01.
// A PDI plan per finished-good item lists characteristics (spec + inspection method).
// Before a part with a plan can be invoiced, an accepted PDI report must cover the
// dispatch quantity; the invoice then links to it.
//
// Ported from the original Express app (`app/server/pdi.ts`) but adapted to Prisma
// + the existing simplified Prisma schema (PdiPlan.characteristics and
// PdiReport.readings are non-nullable String columns into which we JSON-stringify
// the full rich payload — drgRev / drgDate / refStandard / chars / readings /
// inspector / note / invoice info etc. — without touching the schema).

import { db } from "@/lib/db";
import { ErpError, today } from "./shared";
import { onHandMap } from "./service";
import {
  specText,
  charOk,
  type PdiChar,
  type PdiPlan,
  type PdiReading,
  type PdiReportDetail,
  type PendingRow,
  type PlanRow,
  type CreateReportInput,
} from "./pdi-shared";

// Re-export the pure helpers + types so callers can import everything from one
// place (`@/lib/erp/pdi`). Client components should import from `pdi-shared`
// directly to avoid pulling Prisma into the browser bundle.
export {
  specText,
  charOk,
  type PdiChar,
  type PdiPlan,
  type PdiReading,
  type PdiReportDetail,
  type PendingRow,
  type PlanRow,
  type CreateReportInput,
};

// ---------- JSON payload helpers ----------
// The PdiPlan.characteristics column stores the full plan minus itemId (which is
// already a column): { drgRev, drgDate, refStandard, chars }.
type PlanPayload = { drgRev: string; drgDate: string | null; refStandard: string; chars: PdiChar[] };

// The PdiReport.readings column stores the full report payload (everything that
// isn't already a dedicated column on the simplified PdiReport model):
// { pdiNo, soId, soLineId, customerId, drgRev, drgDate, refStandard, mtr, chars,
//   readings, inspector, note, invoiceId, invoiceDate }
type ReportPayload = {
  pdiNo: string;
  soId: number;
  soLineId: number;
  customerId: number;
  drgRev: string;
  drgDate: string | null;
  refStandard: string;
  mtr: boolean;
  chars: PdiChar[];
  readings: PdiReading[];
  inspector: string;
  note: string;
  invoiceId: number | null;
  invoiceDate: string | null;
};

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function safePlanPayload(p: Partial<PlanPayload> | null | undefined): PlanPayload {
  return {
    drgRev: p?.drgRev ?? "00",
    drgDate: p?.drgDate ?? null,
    refStandard: p?.refStandard ?? "",
    chars: Array.isArray(p?.chars) ? p!.chars : [],
  };
}

function safeReportPayload(p: Partial<ReportPayload> | null | undefined): ReportPayload {
  return {
    pdiNo: p?.pdiNo ?? "",
    soId: p?.soId ?? 0,
    soLineId: p?.soLineId ?? 0,
    customerId: p?.customerId ?? 0,
    drgRev: p?.drgRev ?? "00",
    drgDate: p?.drgDate ?? null,
    refStandard: p?.refStandard ?? "",
    mtr: !!p?.mtr,
    chars: Array.isArray(p?.chars) ? p!.chars : [],
    readings: Array.isArray(p?.readings) ? p!.readings : [],
    inspector: p?.inspector ?? "",
    note: p?.note ?? "",
    invoiceId: p?.invoiceId ?? null,
    invoiceDate: p?.invoiceDate ?? null,
  };
}

// ---------- plans ----------
export async function getPlan(itemId: number): Promise<PdiPlan | null> {
  const row = await db.pdiPlan.findFirst({ where: { itemId } });
  if (!row) return null;
  const p = safePlanPayload(parseJson<Partial<PlanPayload>>(row.characteristics, {}));
  return { itemId, drgRev: p.drgRev, drgDate: p.drgDate, refStandard: p.refStandard, chars: p.chars };
}

export async function listPlans(): Promise<PlanRow[]> {
  const fgs = await db.item.findMany({ where: { type: "FG" }, orderBy: { code: "asc" } });
  const plans = await db.pdiPlan.findMany();
  const planByItem = new Map(plans.map((p) => [p.itemId, p]));
  return fgs.map((i) => {
    const row = planByItem.get(i.id);
    const plan: PdiPlan | null = row
      ? (() => {
          const p = safePlanPayload(parseJson<Partial<PlanPayload>>(row.characteristics, {}));
          return { itemId: i.id, drgRev: p.drgRev, drgDate: p.drgDate, refStandard: p.refStandard, chars: p.chars };
        })()
      : null;
    return { itemId: i.id, code: i.code, name: i.name, customerPartNo: i.customerPartNo, plan };
  });
}

export async function savePlan(d: PdiPlan): Promise<PdiPlan | null> {
  const item = await db.item.findUnique({ where: { id: d.itemId } });
  if (!item) throw new ErpError("Item not found");
  if (item.type !== "FG") throw new ErpError("PDI plans are for finished goods");
  // validate + normalise char rows
  const chars: PdiChar[] = d.chars.map((c, i) => ({ ...c, sr: i + 1 }));
  chars.forEach((c, i) => {
    if (!c.description.trim()) throw new ErpError(`Row ${i + 1}: description required`);
    if (c.kind === "num" && (c.nominal == null || c.tolPlus == null || c.tolMinus == null)) {
      throw new ErpError(`Row ${i + 1}: nominal and tolerances required`);
    }
    if (c.kind === "attr" && !c.spec.trim()) throw new ErpError(`Row ${i + 1}: specification required`);
  });
  const payload: PlanPayload = {
    drgRev: d.drgRev?.trim() || "00",
    drgDate: d.drgDate || null,
    refStandard: d.refStandard ?? "",
    chars,
  };
  // empty plan → delete any existing row
  if (!chars.length) {
    const existing = await db.pdiPlan.findFirst({ where: { itemId: d.itemId } });
    if (existing) await db.pdiPlan.delete({ where: { id: existing.id } });
    return null;
  }
  const existing = await db.pdiPlan.findFirst({ where: { itemId: d.itemId } });
  if (existing) {
    await db.pdiPlan.update({ where: { id: existing.id }, data: { characteristics: JSON.stringify(payload) } });
  } else {
    await db.pdiPlan.create({ data: { itemId: d.itemId, characteristics: JSON.stringify(payload) } });
  }
  return getPlan(d.itemId);
}

// ---------- pending ----------
/** Accepted PDI qty for an SO line that has not yet been linked to an invoice. */
async function openQty(soLineId: number): Promise<number> {
  // The simplified PdiReport table has no soLineId column; we filter the parsed
  // payload stored in `readings`.
  const rows = await db.pdiReport.findMany();
  let sum = 0;
  for (const r of rows) {
    const p = safeReportPayload(parseJson<Partial<ReportPayload>>(r.readings, {}));
    if (p.soLineId !== soLineId) continue;
    if (r.result !== "ACCEPT") continue;
    if (r.invoiceNo) continue; // already linked to an invoice
    sum += r.qty;
  }
  return sum;
}

export async function pending(): Promise<PendingRow[]> {
  const stock = await onHandMap();
  const sos = await db.salesOrder.findMany({ include: { customer: true, lines: { include: { item: true } } } });
  const out: PendingRow[] = [];
  for (const so of sos) {
    if (so.status === "CLOSED") continue;
    for (const l of so.lines) {
      const pend = l.qty - l.dispatchedQty;
      if (pend <= 1e-9) continue;
      const plan = await getPlan(l.itemId);
      if (!plan) continue;
      const covered = await openQty(l.id);
      out.push({
        soId: so.id,
        soNo: so.soNo,
        soLineId: l.id,
        customerId: so.customerId,
        customer: so.customer.name,
        itemId: l.itemId,
        itemCode: l.item.code,
        itemName: l.item.name,
        customerPartNo: l.item.customerPartNo,
        pending: +pend.toFixed(3),
        fgStock: +(stock.get(l.itemId) ?? 0).toFixed(3),
        covered,
        toInspect: Math.max(0, +pend.toFixed(3) - covered),
      });
    }
  }
  return out;
}

// ---------- reports ----------
async function nextPdiNo(): Promise<string> {
  const n = (await db.pdiReport.count()) + 1;
  const d = new Date();
  const yy = (d.getFullYear() % 100).toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `PDI/${yy}${mm}/${String(n).padStart(4, "0")}`;
}

export async function createReport(d: CreateReportInput): Promise<PdiReportDetail> {
  // SO + line lookup
  const so = await db.salesOrder.findFirst({
    where: { lines: { some: { id: d.soLineId } } },
    include: { customer: true, lines: { include: { item: true } } },
  });
  if (!so) throw new ErpError("Sales order line not found");
  const line = so.lines.find((l) => l.id === d.soLineId);
  if (!line) throw new ErpError("Sales order line not found");

  const plan = await getPlan(line.itemId);
  if (!plan) throw new ErpError("No PDI plan for this part — add one in Quality → PDI");

  const covered = await openQty(line.id);
  const pend = line.qty - line.dispatchedQty - covered;
  if (d.qty <= 0 || d.qty > pend + 1e-9) {
    throw new ErpError(`Inspection qty must be between 1 and ${pend} (pending, not yet inspected)`);
  }
  if (!Number.isInteger(d.sample) || d.sample < 1 || d.sample > d.qty || d.sample > 10) {
    throw new ErpError("Sampling no. must be between 1 and the inspection qty (max 10)");
  }
  if (!d.inspector.trim()) throw new ErpError("Inspector name is required");

  // Build readings — validate every char × every sample slot
  const readings: PdiReading[] = plan.chars.map((c) => {
    const vals = (d.readings.find((r) => r.sr === c.sr)?.values ?? [])
      .slice(0, d.sample)
      .map((v) => String(v ?? "").trim());
    if (vals.length < d.sample || vals.some((v) => !v)) {
      throw new ErpError(`${c.description}: enter all ${d.sample} readings`);
    }
    return { sr: c.sr, values: vals, ok: vals.every((v) => charOk(c, v) === true) };
  });
  const result: "ACCEPT" | "REJECT" = readings.every((r) => r.ok) ? "ACCEPT" : "REJECT";
  const pdiNo = await nextPdiNo();

  const payload: ReportPayload = {
    pdiNo,
    soId: so.id,
    soLineId: line.id,
    customerId: so.customerId,
    drgRev: plan.drgRev,
    drgDate: plan.drgDate,
    refStandard: plan.refStandard,
    mtr: !!d.mtr,
    chars: plan.chars,
    readings,
    inspector: d.inspector.trim(),
    note: d.note.trim(),
    invoiceId: null,
    invoiceDate: null,
  };

  const created = await db.pdiReport.create({
    data: {
      invoiceNo: null,
      itemId: line.itemId,
      qty: Math.round(d.qty),
      sampleNo: d.sample,
      date: today(),
      readings: JSON.stringify(payload),
      result,
    },
  });

  // On REJECT, raise an NCR (mirror the original logic).
  if (result === "REJECT") {
    const bad = plan.chars
      .filter((c) => !readings.find((r) => r.sr === c.sr)!.ok)
      .map((c) => c.description)
      .join(", ");
    await db.ncr.create({
      data: {
        date: today(),
        source: "PRE_DISPATCH",
        refNo: `${pdiNo} / ${so.soNo}`,
        itemId: line.itemId,
        batchNo: null,
        qty: Math.round(d.qty),
        defect: `PDI reject — ${bad}`,
        disposition: "PENDING",
        status: "OPEN",
      },
    });
  }

  return getReport(created.id);
}

export async function getReport(id: number): Promise<PdiReportDetail> {
  const r = await db.pdiReport.findUnique({ where: { id } });
  if (!r) throw new ErpError("PDI report not found");
  const p = safeReportPayload(parseJson<Partial<ReportPayload>>(r.readings, {}));

  const item = await db.item.findUnique({ where: { id: r.itemId } });
  const so = p.soId
    ? await db.salesOrder.findUnique({ where: { id: p.soId }, include: { customer: true } })
    : null;
  const inv = r.invoiceNo
    ? await db.invoice.findFirst({ where: { invNo: r.invoiceNo } })
    : null;

  return {
    id: r.id,
    pdiNo: p.pdiNo,
    date: r.date,
    soId: p.soId,
    soNo: so?.soNo ?? "",
    soLineId: p.soLineId,
    customerId: p.customerId,
    customer: so?.customer.name ?? "",
    itemId: r.itemId,
    itemCode: item?.code ?? "",
    itemName: item?.name ?? "",
    customerPartNo: item?.customerPartNo ?? null,
    qty: r.qty,
    sample: r.sampleNo,
    drgRev: p.drgRev,
    drgDate: p.drgDate,
    refStandard: p.refStandard,
    mtr: p.mtr,
    chars: p.chars,
    readings: p.readings,
    result: r.result as "ACCEPT" | "REJECT",
    inspector: p.inspector,
    note: p.note,
    invoiceId: inv?.id ?? null,
    invoiceNo: r.invoiceNo,
    invoiceDate: inv?.date ?? null,
  };
}

export async function listReports(): Promise<PdiReportDetail[]> {
  const rows = await db.pdiReport.findMany({ orderBy: { id: "desc" } });
  const out: PdiReportDetail[] = [];
  for (const r of rows) out.push(await getReport(r.id));
  return out;
}
