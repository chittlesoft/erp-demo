# Phase 2 Prototype — Purchase, Sales, GST, E-invoice, Tally (built 2026-10-09)

Same app (`app/`), same preview link (asset 49687baa-4ccb-4c4c-850d-8e9ff66082e3). New server module: `app/server/phase2.ts`.

## New screens
| Screen | What it does |
|---|---|
| Customers & Vendors | Parties with GSTIN validation (format + state-code match), state, distance; shows CGST+SGST vs IGST |
| Purchase | Indents (raised from MRP shortages) → PO (multi-line, from indents) → GRN against PO into **QC Quarantine** with mandatory supplier batch, input GST split |
| Sales & GST Invoices | OEM sales orders (customer PO, delivery date, overdue flag) → dispatch from FG with FIFO serial allocation → tax invoice |
| Invoice view | Printable tax invoice (HSN, OEM part no., serial ranges, CGST/SGST or IGST, round-off, amount in words); **e-invoice JSON (NIC/IRP schema v1.1)** download; record IRN / Ack no. / e-way bill no.; 30-day IRP reporting reminder |
| Tally & Company | Company GSTIN/address/state; Tally Prime XML export (Sales + Purchase vouchers, accounting voucher view) by date range with preview |
| Dashboard | + order book, sales MTD, invoices awaiting IRN, open POs / indents |
| Traceability | Serial now shows dispatch status, customer and invoice no. |

## GST / compliance rules implemented
- Invoice / PO / GRN / SO / indent numbers by Indian FY: `INV/26-27/0001` (≤16 chars)
- Intra-state (seller state = place of supply) → CGST + SGST (half each); else IGST
- E-way bill flagged when invoice value > ₹50,000 (Rule 138); vehicle no. mandatory then
- E-invoice mandatory for B2B (AATO > ₹5 Cr since 1 Aug 2023); IRN must be 64-hex; reminder to report within 30 days (applies at AATO ≥ ₹10 Cr)
- Sources: https://taxgarden.in/blog/e-invoice-mandatory-5-crore-businesses-2026 , https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter16/rule138_v1.00.html

## Tally Prime mapping
- Sales voucher: Party Dr (total) / Sales ledger Cr (taxable) / Output CGST+SGST or IGST Cr / Round Off
- Purchase voucher (per GRN): Party Cr / Purchase ledger Dr / Input CGST+SGST or IGST Dr; vendor invoice no. in REFERENCE
- Party and GST ledgers must exist in Tally with identical names (to confirm with accounts team)

## Not yet (prototype limits)
- Direct IRP / e-way bill API via GSP (needs GSP account & credentials) — currently JSON upload + manual IRN entry
- QR code on printed invoice (comes with IRN API)
- Credit/debit notes, sales returns, TDS/TCS, multi-rate invoices beyond item GST rate
- Incoming inspection workflow (QC release is a stock transfer for now → Phase 3)
- Placeholder company details & demo GSTINs — replace in Tally & Company
