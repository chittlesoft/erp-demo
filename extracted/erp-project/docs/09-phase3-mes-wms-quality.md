# Phase 3 Prototype — MES-lite, WMS-lite, Quality
Built 2026-10-10. Source: app/server/phase3.ts, app/client/src/pages/{shopfloor,warehouse,quality}.tsx.

## Screens
- **Shop Floor** (/shopfloor)
  - Live board: WIP waiting per station (ASM-1, ASM-2, WELD, CAL, MARK, PACK), units on hold, today's output and pass rate, per-order progress, FPY, top test failures, latest scans
  - Station terminal: pick station + operator, scan a serial, enter test values (checked against limits → PASS/FAIL), hold queue with Rework / Scrap disposition, CSV upload of bench results
  - Routings & limits: operations and test parameters per product
- **Warehouse Bins** (/warehouse): bin map per store with value, put-away of unbinned stock, FIFO pick lists for production orders and sales orders (printable), blind cycle count with variance posting
- **Quality** (/quality): incoming inspection of QC-quarantine lots with AQL sample size, accept/partial/reject, NCR register with disposition (Return to vendor / Scrap / Use as is), PPAP register per OEM customer and part (level, status, submission and PSW dates)
- Also changed: Production → "Release to floor"; Traceability shows station history and test values per serial; Dashboard has 4 Phase 3 KPI tiles

## Refinements (2026-10-10, round 2)
- **Bin-to-bin move**: click any bin card → move a batch to another bin in the same store (location only; stock ledger unchanged)
- **Labels with QR codes** (print from browser to any A4 label sheet; no printer driver integration needed)
  - Serial labels per production order: 3 × 7 on A4 (63.5 × 38.1 mm) — QR = serial, item code, OEM part no., order, date. From Shop Floor board or Production → Labels
  - Bin labels per store: 2 × 5 on A4 (99 × 57 mm) — QR = `BIN:<code>`. From Warehouse Bins → Bin labels
- **CSV template** for bench results: Station terminal → "Template for waiting units" downloads `serial,<param keys>` with every unit waiting at that station; `#` lines explain each key and are ignored on import
- **PPAP gate on dispatch**: invoice is blocked if a PPAP record for that customer + part exists and is not Approved / Interim. Parts with no PPAP record (e.g. job-work or aftermarket customers) are allowed. Dispatch dialog shows PPAP status per line
- Printing: sidebar and header are hidden when printing (invoices, pick lists, labels)

## Pre-dispatch inspection (PDI) — added 2026-10-10
- Format follows Tau Power **TPE/IMS/FR/78 Rev 01 (23.09.2026)**: part name/no., drawing rev & date, reference standard, material test report Yes/No, invoice no./qty/date, sampling no., customer; characteristics with specification, inspection method, readings 1…n, Accept/Reject
- **PDI plans** per part (Quality → Pre-dispatch → PDI plans): measured characteristics (nominal −/+ tolerance) or OK/NG checks (e.g. thread gauge). Seeded for TTT000002 and TTT000004 exactly as on the reports
- **Inspection**: open sales-order lines for parts with a plan appear under "Awaiting PDI". Enter invoice qty, sampling no. (default 5, max 10) and readings; out-of-tolerance values turn red; result is ACCEPT only if every reading is in spec. A rejected PDI raises an NCR (source "Pre-dispatch")
- **Dispatch gate**: an invoice cannot be created for a part with a PDI plan unless accepted PDIs cover the dispatch qty. On invoicing, the PDI is linked and its printed report shows the invoice no. and date. The invoice page lists its PDI reports
- **Print**: each PDI report prints on A4 in the Tau Power format
- Demo: SO/26-27/0004 (Orient, 11 × TTT000002 + 7 × TTT000004 at ₹1,050) has PDIs with the exact readings from the reference reports, ready to invoice (taxable ₹18,900, total ₹22,302). SO/26-27/0005 (15 × TTT000002) is awaiting PDI

## Business rules
1. Releasing a production order generates its serials and puts them in the queue at the first operation. Released orders can only be closed from the shop floor; the old one-click "Complete" is blocked.
2. Operations cannot be skipped; a unit can only be scanned at its current operation.
3. Any value outside limits = FAIL → unit goes ON HOLD at that station.
4. Rework returns the unit to the same operation (max 2 reworks); Scrap creates an in-process NCR automatically.
5. Closing an order posts good units to FG (serials IN_STOCK with EOL data); scrapped units counted as rejected.
6. GRN goods land in QC quarantine (not available for issue). Inspection moves accepted qty to RM, rejected qty to REJ and raises an incoming NCR.
7. Bin stock follows the batch ledger: issues/dispatches deplete bins FIFO; anything not in a bin shows under Put-away.
8. Cycle count posts the variance as a stock adjustment, valued at item rate.

## Routings (illustrative)
| Product | Operations |
|---|---|
| EGTS | 10 ASM-1 probe assembly → 20 WELD crimp/seal + pull test → 30 CAL calibration & insulation test → 40 MARK → 50 PACK |
| NOx / Lambda / UQS / Delta P | assembly (ASM-1/ASM-2) → weld/seal → CAL EOL test (sensor-specific parameters) → MARK → PACK |
Test limits (e.g. EGTS accuracy ±5 °C at 600 °C, insulation ≥100 MΩ) are placeholders. **Replace with Tau Power control-plan values before use.**

## Limitations
- Labels print from the browser on A4 sheets; no direct Zebra/TSC (ZPL) thermal-printer output yet
- No live test-bench interface — CSV upload only
- No user logins / roles yet (operator name is free text)
- Routings and test limits are illustrative
- PPAP register holds status only, no document attachments
- SQLite prototype; demo data resets on server restart

## Inputs needed from Tau Power
- Control plan / routing per product family: operations, stations, cycle times, test parameters and limits
- EOL bench export sample file (CSV/Excel) from each bench
- Store layout: racks, shelves, bin codes
- Current PPAP status per OEM part number
- Sampling plan (AQL) used for incoming inspection
