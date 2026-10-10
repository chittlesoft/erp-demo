# Implementation Phases
| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements confirmation, data model | Done (v1) |
| 1 | Masters, BOM, Inventory, Production, MRP, serial traceability | Prototype built — awaiting user review |
| 2 | Purchase (indent→PO→GRN), Sales orders, GST invoice, e-invoice JSON, e-way bill data, Tally Prime XML export | Prototype built — awaiting user review |
| 3 | **MES-lite shop floor**: routing per product (assembly → calibration/EOL test → laser marking → packing), station-wise serial scan in/out, pass/fail + rework loop, test values entered or uploaded (CSV/Excel), WIP & FPY by station; **WMS-lite**: bin/rack locations, put-away from GRN, QC release, FIFO pick lists for dispatch, cycle count; **Quality**: incoming/in-process/final inspection, NCR, PPAP register | Prototype built 2026-10-10 — awaiting user review (docs/09) |
| 4 | Job Work outward + inward (Sec. 143 challans, 1-yr/3-yr return tracking, ITC-04), dashboards (OEE, FPY, order book, inventory ageing), GSP API (IRN/QR, e-way bill), credit/debit notes | Not started |
| 5 | HR & attendance, login/roles hardening, PostgreSQL go-live, barcode scanners/label printers, test-bench direct integration | Not started |
Each phase: build → test with real data → parallel run → go-live.

## Phase 1 → production-ready checklist
- [ ] Login + roles (Admin, Planner, Store, QC, Production, Purchase, Sales, Accounts)
- [ ] PostgreSQL + audit log + backups
- [ ] BOM versions / engineering change notes
- [ ] Routings & work centres (operations, cycle times) for capacity scheduling
- [ ] EOL test-bench CSV import per serial
- [ ] Opening stock import from Excel/Tally
- [ ] Barcode / QR labels for batches and serials
