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
- Job work: BOTH directions (to confirm)
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

## Still open
- [ ] Job work direction(s): outward, inward, or both?
- [ ] Is e-invoicing mandatory for you (turnover > Rs 5 Cr)?
- [ ] Tally version (Tally Prime / ERP 9)?
- [ ] Do EOL test benches export data files (CSV) we can import?
