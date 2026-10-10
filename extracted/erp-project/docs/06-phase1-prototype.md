# Phase 1 Prototype — SensorERP (built 2026-10-09)

Source: `app/` (Express + React + Tailwind/shadcn + Drizzle/SQLite). Run: `cd app && npm ci && npm run dev` (port 5000). Fresh demo data is seeded when `data.db` is absent.

## Screens
| Screen | What it does |
|---|---|
| Dashboard | Inventory value, open orders, good/rejected units, first-pass yield, output by product line, below-reorder list |
| Items | Item master: type (RM/SFG/FG/Consumable), product line, HSN, GST %, UoM, traceability (none/batch/serial), reorder level, std cost, OEM part no. |
| Bill of Materials | Multi-level BOM with scrap %, inline sub-assembly expansion, cost roll-up, circular-BOM protection |
| Inventory | Batch-wise stock by location (RM, WIP, FG, QC Quarantine), GRN receipt (batch mandatory for batch items), transfers / QC release, stock ledger |
| Production | Plan → Start (shortage check, FIFO batch issue) → Complete (good/reject, output to stock, serial generation) |
| MRP Planning | Multi-level net requirements for planned orders vs free stock (QC excluded); "Plan order" for make items |
| Traceability | Serial → product, order, EOL values, component batches; Batch → all affected orders & serials (recall impact) |

## Business rules implemented
- Serial format: `<LINE>-<YYMM>-<seq>` (NOX, EGT, UQS, DPS, LMB)
- Discrete (NOS) requirements round up; scrap % applied
- QC Quarantine stock excluded from MRP and issue
- Good + rejected must equal order qty; rejected units get FAIL serials

## Known prototype limitations
- No login / roles yet; SQLite single-file DB
- EOL test values are simulated (to be replaced by test-bench CSV import)
- Single BOM version (A); no routing/work-centre scheduling yet
- Purchase indent button disabled (Phase 2)

## Demo data
5 FG sensors, 1 SFG (NOx probe), 14 RM items with realistic HSN codes; 6 completed orders (~550 serials), 1 in progress, 3 planned.

## Preview
Deployed app asset: 49687baa-4ccb-4c4c-850d-8e9ff66082e3 (redeploy with update_asset_id to keep the same link). Backend runs in the session sandbox, so the preview only works while that server is running; for permanent use, publish or host it.
