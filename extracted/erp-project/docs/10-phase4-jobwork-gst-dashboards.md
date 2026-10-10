# Phase 4 — Job work, GST e-documents, credit/debit notes, dashboards

Status: prototype built and deployed 2026-10-10 (same app as Phase 3). Source in app/ (server/phase4.ts, client/src/pages/jobwork.tsx, notes.tsx, analytics.tsx, components/edoc.tsx).

## 1. Job work — goods sent out (Tau Power is principal)
- Delivery challan JWO/yy-yy/nnnn (≤16 characters), printed in triplicate: original for consignee, duplicate for transporter, triplicate for consigner (Rule 45/55) — [Telangana job work handbook](https://www.tgct.gov.in/tgportal/GST/GstHandbook/Handbook%20on%20Job%20Work%20under%20GST_June%20(4th)%202026%20Edition.pdf).
- Stock moves RM → JW (job-worker) store; JW stock is owned but excluded from available stock, put-away and FIFO picks.
- Return deadline per line: inputs 1 year, capital goods 3 years; moulds, dies, jigs, fixtures and tools are exempt from the limit — [CBIC Sec. 143](https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/acts/2017_CGST_act/active/chapter21/section143_v1.00.html), [GST Council flyer](https://gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Job_Work.pdf).
- Overdue lines can be marked as deemed supply (estimated tax + 18% interest shown; raise the tax invoice).
- Receive back with job worker's challan number, quantity and loss/waste.
- E-way bill: compulsory for inter-state job work regardless of value — [CBIC Rule 138](https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter16/rule138_v1.00.html). Validity 1 day per 200 km — [EWB portal docs](https://docs.ewaybillgst.gov.in/).

## 2. Job work — customer goods received (Tau Power is job worker)
- Inward register JIN/…, return challan JRT/… plus job-work tax invoice JWI/… for processing charges, SAC 998874 (manufacturing services on computer, electronic & optical products) at 18% default — [findgst SAC 9988](https://findgst.in/saclist/9988), [GimBooks](https://www.gimbooks.com/blog/manufacturing-services-hsn-code-9988-and-gst-rates/). To be confirmed by Tau Power's tax consultant.

## 3. ITC-04
- Table 4 (sent) and Table 5A (received back) CSV in GSTN offline-tool column order.
- Frequency: half-yearly (25 Oct / 25 Apr) when aggregate turnover > ₹5 Cr, else annual (25 Apr) — [Oxyzo](https://www.oxyzo.in/en/blogs/itc-04-filing-process-benefit-exemption-and-penalties). Toggle in Tally & Company.

## 4. E-invoice and e-way bill (GSP)
- Documents: INV, CRN, DBN, JWI (e-invoice); JWO challans (standalone e-way bill).
- Pre-validation: GSTIN check digit (mod-36), document number format, HSN length, totals, 30-day reporting rule when AATO ≥ ₹10 Cr.
- IRN = SHA-256 of seller GSTIN + FY + doc type + doc number; response AckNo/AckDt/Irn/SignedQRCode/EwbNo — [NIC sandbox FAQ](https://einv-apisandbox.nic.in/FaqsonAPI.html), [Generate IRN API](https://einv-apisandbox.nic.in/version1.03/generate-irn.html).
- Cancel IRN only within 24 hours, and only after cancelling the e-way bill — [ClearTax FAQ](https://docs.cleartax.in/e-invoicing/frequently-asked-questions). Cancelling IRN voids the invoice: dispatch stock, serials, SO quantities and PDI reports are released.
- Modes: SIMULATED (default; follows sandbox rules, marked "not a legal IRN") and LIVE. Live mode needs server env vars GSP_BASE_URL, GSP_CLIENT_ID, GSP_CLIENT_SECRET, GSP_USERNAME, GSP_PASSWORD and a mapping to the chosen GSP's API. Every request is stored in the GSP API log.

## 5. Credit / debit notes
- CN/… and DN/… against an original invoice; sales return brings goods into QC quarantine (batch RET-nnnn, serials marked RETURNED); value cap per line; deadline 30 Nov after FY end — [CBIC Sec. 34](https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/acts/2017_CGST_act/active/chapter7/section34_v1.00.html).
- Exported to Tally as Credit Note / Debit Note vouchers; job-work invoices as Sales (Job Work Charges).

## 6. Management dashboards
- OEE = availability × performance × quality by station and 14-day trend; downtime Pareto with manual downtime logging; planned minutes per station configurable (default 450).
- First-pass yield by product and station; rolled throughput yield.
- Order book by customer and due bucket, overdue lines, weekly dispatches.
- Inventory ageing (0–30/31–60/61–90/90+ days) by RM/SFG/FG, oldest batches, value at job workers.
- ITC-04 countdown and job-work overdue KPIs.

## Placeholders / open items
- Job workers (Sharp Electroplaters, Shree Heat Treatment Works, Precitool Engineering), their GSTINs and the Apex inward job are demo data.
- Turnover band (ITC-04 frequency, 30-day rule) to be confirmed.
- GSP provider not chosen; OEE history is demo data until machine/scan data accumulates.
