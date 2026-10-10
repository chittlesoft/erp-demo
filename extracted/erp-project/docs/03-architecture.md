# Architecture (proposed)
- Frontend: React + TypeScript, Tailwind, responsive PWA for shop floor
- Backend: Node.js (Express/NestJS) REST API
- DB: PostgreSQL (multi-plant via plant_id); Drizzle/Prisma ORM
- Auth: JWT + role-based permissions (Admin, Planner, Store, QC, Purchase, Sales, Accounts)
- Integrations (later): GST e-invoice/e-way bill via GSP API, Tally XML export, bank statement import
- Reports: SQL views + charts; PDF invoices/challans
- Deployment: cloud VM or managed (Docker), nightly backups

## Core entities
Item, BOM/BOMLine, Warehouse, StockLedger, Customer, Vendor, SalesOrder, PurchaseOrder, GRN, ProductionOrder, WorkCenter, Inspection, Invoice, JobWorkChallan, User/Role, AuditLog

## Prototype implementation (Phases 1–3)
- server/storage.ts — masters, stock ledger, production, MRP, purchase/sales/GST (Phases 1–2)
- server/phase3.ts — MES-lite, WMS-lite, Quality. Tables: routing_ops, wip_units, op_logs, bins, bin_txns, cycle_counts, inspections, ncrs, ppap
- Warehouses: RM, FG, WIP, QC (quarantine, excluded from available stock), REJ (rejected / return-to-vendor, excluded)
- Bin stock is a sub-ledger of the batch stock ledger: issues and dispatches reduce bin quantities FIFO automatically; unbinned stock is shown for put-away
- API groups: /api/mes/*, /api/wms/*, /api/qc/*, /api/phase3/summary
