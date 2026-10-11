# Future Iterations / Backlog
- Marathi/Hindi UI
- WhatsApp alerts (low stock, delays)
- IoT machine data for OEE
- Second plant / multi-company
- Service & warranty module
- Mobile app (native) if PWA insufficient
- Barcode/QR scanning on shop floor (batch issue, serial labels)
- PPAP document attachments (PSW, control plan, PFMEA files) per register entry
- Field-return / warranty analysis by serial and component batch
- Live GSP connection: choose GSP, obtain sandbox + production credentials, map live adapter to provider API (simulated mode built in Phase 4)
- Tally two-way sync (ledger master import, payment status back to ERP) via Tally Prime XML/HTTP port 9000
- Direct EOL test-bench integration (file drop / OPC-UA / serial) instead of CSV upload
- Thermal label printing (ZPL for Zebra/TSC) — A4 browser labels already built
- PPAP interim-approval expiry date (auto-block after expiry)
- Bin capacity, ABC-based cycle count schedule
- In-process SPC charts (X-bar/R, Cpk) per test parameter
- 8D / CAPA workflow linked to NCRs; supplier scorecard from IQC
- PDI: photo attachments, gauge/instrument calibration IDs, customer-specific PDI formats, auto-email PDI with invoice

## Phase 5 candidates
- User logins, roles and approval workflows (audit trail per user)
- HR / attendance / operator skill matrix
- PostgreSQL migration, backups, hosting on company cloud
- Barcode/QR scanners on shop floor and stores
- Test-bench integration (auto-capture EOL results)
- IoT machine signals for automatic OEE (replace daily station history)
- ITC-04 JSON generation directly (currently CSV for GSTN offline tool)
- Job-work deemed-supply auto invoice after Sec. 143 time limit
