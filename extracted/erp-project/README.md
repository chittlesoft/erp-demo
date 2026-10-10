# Company Manufacturing ERP
See docs/: 01 research, 02 requirements, 03 architecture, 04 phases, 05 backlog, 06 Phase 1 prototype, 07 Phase 2 prototype, 08 company profile, 09 Phase 3 prototype (MES/WMS/Quality, PDI), 10 Phase 4 prototype (job work, ITC-04, GSP e-invoice/e-way bill, credit/debit notes, dashboards). reference/: real invoice + PDI samples. App source: app/.
## Decision log
- 2026-10-09: Project created; cloud web app, phased rollout starting with Phase 1.
- 2026-10-09: Products confirmed (NOx, EGTS, UQS, Delta P, Lambda sensors); 1–100 users, single plant; OEM supply + job work; Tally retained for accounting (ERP → Tally sync).
- 2026-10-09: Phase 1 prototype stack: Express + React + SQLite (Drizzle); migrate to PostgreSQL for production.
- 2026-10-09: Phase 1 prototype built (docs/06-phase1-prototype.md, source in app/).
- 2026-10-09: Answers — job work both directions; e-invoicing mandatory; Tally Prime (assumed); EOL export unknown → manual + CSV/Excel import.
- 2026-10-09: Phase 2 prototype built (docs/07-phase2-prototype.md).
- 2026-10-09: Loaded real company profile (Tau Power Electronics Pvt Ltd, CIN, addresses, certifications) and product models (LD6000 D1/D3, LD6549, EGTS TC/NTC, UQS, Delta P SENT, NOx BS VI) from tau-power.com. GSTIN pending. App renamed Tau Power ERP.
- 2026-10-09: GSTIN loaded; Hinjawadi confirmed as plant; MES-lite + WMS-lite added to Phase 3 (no existing MES/WMS); job work moved to Phase 4.
- 2026-10-10: Phase 3 prototype built — MES-lite shop floor, WMS-lite bins, Quality (IQC, NCR, PPAP). Routings and test limits are illustrative pending Tau Power control plans (docs/09-phase3-mes-wms-quality.md).
- 2026-10-10: Phase 3 refinements — bin-to-bin move, QR serial/bin labels (A4), bench CSV template, PPAP gate on dispatch (blocks when record exists and not Approved/Interim).
- 2026-10-10: Added real parts TTT000002 / TTT000004 (TML 570615249301 / …303) and customer Orient Engineering Solutions from user's sales invoice; built PDI module in format TPE/IMS/FR/78 with dispatch gate.
- 2026-10-10: Phase 4 prototype built — Sec. 143 job work challans (out) and customer-owned job work (in, SAC 998874 @18% default, to confirm with tax consultant), ITC-04 CSV, credit/debit notes with sales returns, invoice void/cancel-IRN, simulated GSP (IRN, signed QR, e-way bill) with live adapter stub via env vars, management dashboards (OEE, FPY/RTY, order book, inventory ageing). Demo job workers/GSTINs are placeholders; demo customer GSTINs made checksum-valid. (docs/10-phase4-jobwork-gst-dashboards.md)
