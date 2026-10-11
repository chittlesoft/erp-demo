# Company Profile — Tau Power Electronics Private Limited (loaded 2026-10-09)

Sources: https://www.tau-power.com (home + product pages), https://www.tofler.in/tau-power-electronics-private-limited/company/U27900PN2023PTC224077 , https://lei.bloomberg.com/leis/view/894500OIKFXFAECXHM86

| Field | Value |
|---|---|
| Legal name | Tau Power Electronics Private Limited |
| CIN | U27900PN2023PTC224077 (incorporated 15 Sep 2023, RoC Pune) |
| LEI | 894500OIKFXFAECXHM86 |
| Directors | Ashwath Ram (founder), Vinita Ram |
| Registered office | 701 & 702 Aquila, Plot No. 101, Anand Park, Aundh, Pune 411007 |
| Plant (confirmed) / dispatch-from | 247/2, Phase 2, Rajiv Gandhi Infotech Park, Hinjawadi, Pune 411057 |
| Phone / email | +91 91721 23430 / info@tau-power.com |
| Certifications | IATF 16949, CE, E-Mark (VCA UK), CNAS EMC labs; standards ISO 26262, ECE R10, BS VI, Euro VI, China VI |
| GSTIN | 27AAKCT4244J1Z0 (provided by user, checksum valid) |

## Product models loaded into the item master
| ERP code | Product (from website) |
|---|---|
| FG-NOX-BS6 | NOx sensor — BS VI / Euro VI / China VI, real-time data to ECU |
| FG-EGTS-TC / FG-EGTS-NTC | EGTS — thermocouple or PTC/NTC, -40 to 1000 °C, cold-junction compensation, 1–4 probes |
| FG-UQS-US | Urea Quality Sensor — ultrasonic, anti-bubble (140,000+ units sold) |
| FG-DPS-SENT | Delta P — MEMS, SENT output, temperature compensated |
| FG-LD6000-D1 / -D3 | LD6000 planar 2-state lambda, 13 V heater; protector D1 (≥60 ms) / D3 (≤250 ms) |
| FG-LD6549 | LD6549 5-wire wideband lambda, 7.5 V heater, λ 0.65–∞, for CJ125/CJ135 |

## Real parts from a Tau Power sales invoice + PDI reports (2026-10-10)
Source: reference/sales-invoice-lines-orient-egts.png, reference/pdi-TTT000002.png, reference/pdi-TTT000004.png
| Tau No (ERP code) | Description on invoice | TML part no. | HSN | GST | Rate | PDI characteristics (TPE/IMS/FR/78) |
|---|---|---|---|---|---|---|
| TTT000002 | EGTS (Analogue) - 108 | 570615249301 | 90271000 | 18% | ₹1,050 | Probe length 70±1 (vernier), harness 400±10 (tape), mounting M14x1.5-6g (thread gauge) |
| TTT000004 | EGT Sensor | 570615249303 | 90251990 | 18% | ₹1,050 | Probe length 50±1 (vernier), harness 300±10 (tape), mounting M12x1.25-6h (thread gauge) |
- Customer on those documents: **Orient Engineering Solutions** (Pune). Invoice qty 11 and 7, sampling 5 each, drawing rev 00 dated 06-10-2026, no material test report.
- Customer part numbers are Tata Motors (TML) numbers. Item codes in the ERP now use Tau part numbers (TTTxxxxxx).
- Orient's GSTIN and address are not public — the demo uses placeholder GSTIN 27AAHFO4821K1Z1 and "Pune 411026"; customer PO numbers are placeholders.
- Note: HSN differs between the two EGT parts (90271000 vs 90251990) — confirm the correct classification with the tax consultant.

Other prices, BOMs, raw materials, OEM part numbers, customers and vendors are still **illustrative** — replace with real data.

## Notable for ERP design
- Website states production is "fully automated" with "ERP+MES+WMS traceability" → ask whether an MES/WMS already exists; if so, Phase 3 should integrate (import EOL/serial data) rather than duplicate.
- Two Pune sites, same state → one GSTIN; treat Aundh as registered office and Hinjawadi as plant unless told otherwise.
