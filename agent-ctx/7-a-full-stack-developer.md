# Task 7-a — full-stack-developer (webDevReview round 3)

## Brief
Enrich the seed data so the PDI + shopfloor boards show realistic data, AND wire
the PDI dispatch gate into the invoice flow. Data + backend task. Coordinated
with the parallel feature agent 7-b (which owns the activity log + UI polish) —
I did NOT touch the schema (no new `ActivityLog` model) and stayed strictly
inside my owned file list.

## What I own (and did NOT touch outside this list)
- MOD `src/lib/erp/pdi.ts`                          — appended `assert`, `link`, `status`
- MOD `src/lib/erp/seed.ts`                         — PDI plans + 2nd open SO + PDI reports + WIP units
- MOD `src/app/api/sales/invoices/create/route.ts`  — wired the dispatch gate (assert before, link after)

## Dependencies I relied on (read-only)
- `src/lib/erp/pdi-shared.ts` — PdiChar type (imported into seed.ts)
- `src/lib/erp/phase3.ts` — `ensureRoutings` (imported into seed.ts so routing ops exist before WipUnits are seeded)
- `src/lib/erp/phase2.ts` — `createInvoice` (called from the route; it returns totals only, no invoice id/invNo, so the route re-fetches the newest ACTIVE invoice for the SO to recover them for `link`)
- `src/lib/erp/api.ts` — `api` wrapper + `body` helper
- `prisma/schema.prisma` — confirmed the simplified PdiPlan/PdiReport/WipUnit models are sufficient; no `db:push` needed

## What I changed

### `src/lib/erp/pdi.ts` — dispatch gate exports (appended after `listReports`)
- `status(soId)` → per-line `{ soLineId, required: boolean (has plan), covered: number (open accepted un-invoiced PDI qty) }`.
- `assert(soId, lines)` → for each dispatched line whose part has a PDI plan, checks `openQty(soLineId) ≥ qty`; on shortfall throws `ErpError("Dispatch blocked: pre-dispatch inspection pending for CODE (PDI covers N of M). Complete PDI in Quality → PDI first.")`. Lines without a plan are skipped. Re-uses the existing private `openQty` helper.
- `link(soId, lines, invoiceId, invNo)` → after invoicing, sets `PdiReport.invoiceNo = invNo` on accepted un-invoiced reports (filtered by `soLineId` parsed out of the `readings` JSON payload — the simplified schema has no `soLineId` column) up to the dispatched qty per line. `invoiceId` param kept for API symmetry with the original Express code; marked `void invoiceId` since our schema uses `invoiceNo: String?` not `invoiceId: Int?`.

### `src/lib/erp/seed.ts` — enriched seed (appended after the existing first-SO invoice)
1. PDI plans for `TTT000002` + `TTT000004` — stored via `db.pdiPlan.create` with `characteristics = JSON.stringify({ drgRev: "00", drgDate: "2026-10-06", refStandard: "-", chars: [...] })`. Local `numChar` + `attrChar` builders mirror the original `num`/`attr` helpers. Characteristics exactly as on the Tau Power PDI report (TPE/IMS/FR/78 Rev 01):
   - TTT000002: Probe Length 70±1 mm (Vernier Caliper), Harness Length 400±10 mm (Measuring Tape), Mounting Fitment M14x1.5-6g (Thread Gauge).
   - TTT000004: Probe Length 50±1 mm, Harness Length 300±10 mm, Mounting Fitment M12x1.25-6h.
2. Second OPEN sales order `SO/26-27/0005` for the Orient customer with `customerPo: "OES/PO/26-27/0142"` (matching the original PDI seed reference). Two soLines (TTT000002 qty 11 + TTT000004 qty 7), both `dispatchedQty: 0`. No invoice created — leaves it open so `pdi.pending()` returns rows.
3. Two accepted PDI reports `PDI/2610/0001` (TTT000002 qty 11 sample 5) + `PDI/2610/0002` (TTT000004 qty 7 sample 5) — stored via `db.pdiReport.create` with the full ReportPayload JSON-stringified into `readings`. Readings exactly as on the attached Tau Power PDI reports → all in-spec → `result: "ACCEPT"`. `date: "2026-10-09"`, `invoiceNo: null` (so they count as dispatch coverage).
4. Four `WipUnit` rows on the IN_PROGRESS order `PO-26-0100` (FG-EGTS-TC) — serialNos `EGT-2610-00201..00204` (above the existing serial range 00001..00200 to avoid collision), distributed across EGTS routing ops: 2 queued at seq 10 (ASM-1), 1 at seq 20 (WELD), 1 at seq 30 (CAL). Called `ensureRoutings()` first so the routing ops exist for `WipUnit.seq` to resolve to a real station.
- Added imports: `import type { PdiChar } from "./pdi-shared"` + `import { ensureRoutings } from "./phase3"`.

### `src/app/api/sales/invoices/create/route.ts` — wired the gate
Rewrote from the 1-line wrapper into a 3-step flow with a typed `CreateInvoiceInput`:
1. `pdiAssert(input.soId, input.lines)` BEFORE `createInvoice` — the `api()` wrapper turns a thrown `ErpError` into a 400 with the gate message.
2. `createInvoice(input)` — does the actual dispatch (allocate serials, build lines, compute tax, insert invoice, link serials, bump dispatchedQty).
3. `db.invoice.findFirst({ where: { soId, status: "ACTIVE" }, orderBy: { id: "desc" } })` to recover the just-created invoice's `id` + `invNo` (`createInvoice` returns only totals), then `pdiLink(input.soId, input.lines, inv.id, inv.invNo)` to set `PdiReport.invoiceNo` on the accepted reports that cover the dispatched qty.

## Verification (all pass)
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → `200`.
- `curl -s -X POST http://localhost:3000/api/seed` → `{"ok":true,"reseeded":true}`.
- `curl -s http://localhost:3000/api/phase3/pdi/plans` → 10 FG items; TTT000002 + TTT000004 each have a populated `plan` (the other 8 have `plan: null`).
- `curl -s http://localhost:3000/api/phase3/pdi/pending` → 2 rows (SO/26-27/0005: TTT000002 pending 11 covered 11 toInspect 0; TTT000004 pending 7 covered 7 toInspect 0).
- `curl -s http://localhost:3000/api/phase3/pdi/reports` → 2 ACCEPT reports (PDI/2610/0001 + PDI/2610/0002), both `invoiceNo: null`.
- `curl -s http://localhost:3000/api/phase3/board` → 1 order (PO-26-0100) with 4 WIP units; 3 stations with WIP > 0 (ASM-1 queued 2, WELD queued 1, CAL queued 1).
- Bonus gate end-to-end test (then reseeded to restore): dispatched 11+7 from the open SO → HTTP 200 + `pdi.link` set `invoiceNo: "INV/26-27/0002"` on both PDI reports. Created a fresh SO with TTT000002 qty 3 (no PDI) + attempted dispatch → HTTP 400 with `Dispatch blocked: pre-dispatch inspection pending for TTT000002 (PDI covers 0 of 3). Complete PDI in Quality → PDI first.` (exactly the spec message).
- dev.log: zero compile errors / module-not-found / type errors referencing my 3 files (`✓ Compiled in 434ms` + `415ms` after edits).

## Tech constraints honoured
- TypeScript strict: typed `CreateInvoiceInput`, typed `PdiChar[]` for the seed characteristics; `void soId; void invoiceId;` to silence unused-param warnings (the schema uses `invoiceNo`, not `invoiceId`, but the original API signature is preserved for callers).
- No `any`. No unused vars. No new npm deps. No new shadcn components. No client-side changes.
- Did NOT touch the dev server (`.zscripts/dev.sh` keeps running; Turbopack HMR reloaded all 3 edits without a restart).
- Did NOT touch any forbidden file: no schema edit (no `ActivityLog` model — 7-b owns that), no other API route, no UI component, no globals.css, no layout/nav/shared/page components, no phase2.ts (which owns `createInvoice`).

## Coordination notes for 7-b (the parallel feature agent)
- The seed now produces a populated PDI Quality tab (plans + pending + reports) and a populated Shopfloor board (stations with WIP) — your UI components can render real data out of the box after a `POST /api/seed` reseed.
- The dispatch gate is wired: a Sales → Dispatch dialog attempt on a fresh SO whose part has a PDI plan but no accepted coverage will return HTTP 400 with a structured message. Your UI's `useAction` hook will surface that message via toast (the existing pattern in sales.tsx).
- I left `invoiceNo: null` on the two seed PDI reports so the gate sees them as open coverage; once a user dispatches the open SO via the UI, `pdi.link` will stamp the new invoice's `invNo` onto them — your PDI reports list will then show the linked invoice number.
