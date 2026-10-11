# Requirements (v1 — confirmed 2026-10-09)

## Company profile
- Products: automotive exhaust after-treatment sensors (BS-VI / emission systems)
  - NOx Sensors
  - Exhaust Gas Temperature Sensors (EGTS)
  - Urea Quality Sensors (UQS)
  - Delta P (differential pressure) Sensors
  - Lambda (O2) Sensors
- Users: 1–100 (design for 100 concurrent, role-based)
- Plants: single plant (keep plant_id in schema for future expansion)
- Customers: OEMs / Tier-1 → IATF 16949, PPAP, delivery-schedule adherence
- Job work: BOTH directions (confirmed)
  - Outward: send material to job workers (e.g. plating, heat treatment, machining, laser welding) with Sec. 143 challans, track returns within 1 yr (inputs) / 3 yrs (capital goods)
  - Inward: receive customer material for processing (ITC-04 reporting)
- Accounting: Tally stays as books of accounts → ERP pushes vouchers (sales, purchase, stock journals) to Tally

## Product-specific needs
- Serial-number traceability per finished sensor (link to batch of sensing element, PCB/ECU, harness, connector)
- Batch/lot traceability for raw materials (zirconia elements, thermocouples/RTDs, ceramics, cables, connectors, housings)
- End-of-line (EOL) test / calibration result capture per serial (pass/fail + key values)
- Product variants per OEM part number (cable length, connector, calibration)
- Customer part-number ↔ internal item mapping
- Warranty / field-return tracking by serial (later phase)

## Functional (Phase 1–3)
- Masters: items (type, product line, HSN, UoM, reorder level), customers (GSTIN, state), vendors, warehouses, work centers
- Multi-level BOM with versions, cost roll-up
- Production orders: BOM explosion, material issue, output with serial generation
- Inventory: stock ledger, multi-warehouse, batch/serial, reorder alerts, FIFO
- Purchase: indent → PO → GRN with incoming inspection
- Sales: quotation (BOM costed) → sales order → dispatch → GST invoice + e-way bill
- QC: incoming / in-process / final; PPAP document register; SPC later
- Job work challans (outward/inward), pending-return tracking
- Dashboards: production vs target, stock aging, order book, rejection trends

## Compliance
HSN-based GST, CGST/SGST vs IGST by place of supply, e-way bill, e-invoice (IRN/QR) if turnover applies, GSTR-1/3B-ready data, ITC-04 for job work.

## Integrations
- Tally Prime: XML voucher export / import (Phase 4)
- GST e-invoice / e-way bill via GSP API (Phase 2–4)

## Non-functional
Cloud web app, mobile-friendly for shop floor, role-based access, audit log, backups, English first (Marathi/Hindi later).

## Answers (2026-10-09)
- Job work: BOTH outward and inward → Phase 3 (Sec. 143 challans, 1-yr/3-yr return tracking, ITC-04)
- E-invoicing: MANDATORY (turnover > Rs 5 Cr) → every B2B invoice needs IRN/QR; ERP generates NIC-schema JSON (Phase 2), direct GSP/IRP API later
- Tally: Tally Prime (assumed from "Yes") → XML voucher export, accounting-voucher view
- EOL test benches: export capability unknown → support manual entry + CSV/Excel upload with column mapping; ask test-bench vendor / quality team

## Still open
- [ ] Confirm Tally Prime (not ERP 9) and exact ledger names
- [ ] Company legal name, GSTIN, address (for invoices)
- [ ] Check with test-bench vendor whether results can be exported (CSV/Excel/database)

## Update 2026-10-09
- Company: Tau Power Electronics Private Limited, CIN U27900PN2023PTC224077; registered office Aundh, plant Hinjawadi (to confirm). See docs/08-company-profile.md.
- Open: GSTIN; whether existing MES/WMS (mentioned on website) is in use; real BOMs, prices, OEM part numbers.

## Update 2026-10-09 (answers)
- GSTIN 27AAKCT4244J1Z0 (checksum valid, Maharashtra) — loaded.
- Aundh = registered office, Hinjawadi = plant (confirmed).
- No MES/WMS today, but **needed** → built inside the ERP as MES-lite + WMS-lite (Phase 3), not a separate product.
- No real BOMs/prices/part numbers available yet → keep illustrative data; replace before go-live (CSV import planned).

### MES-lite requirements (draft)
- Routing master per finished sensor: ordered operations, station, std cycle time, mandatory test parameters with limits.
- Serial is scanned at each station; cannot skip an operation; fail → rework or scrap with reason code.
- Test results (e.g. NOx offset, lambda heater resistance, EGT accuracy, ΔP span) stored per serial; manual entry or CSV/Excel upload.
- Live WIP by station, first-pass yield, top defect reasons.
### WMS-lite requirements (draft)
- Bin locations per warehouse (rack-shelf-bin); put-away on GRN, move on QC release.
- FIFO / FEFO pick list for production issue and dispatch; scan-to-confirm.
- Cycle counting with variance approval.
