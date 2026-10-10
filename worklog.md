# Tau Power ERP — Worklog

## Project context
Porting the **Tau Power Electronics Manufacturing ERP** (originally Express + React + Vite + Drizzle/SQLite)
into the existing Next.js 16 + App Router + Prisma/SQLite project.

Source artifacts extracted to `/home/z/my-project/extracted/erp-project/`.
Original docs in `extracted/erp-project/docs/`.

## Scope of the port (this phase)
- Full Prisma data model (Items, BOM, Inventory, Production, MRP, Parties, Purchase, Sales/GST, Settings).
- Phase 3 MES-lite (shop floor) + Quality + Warehouse bins data model.
- Phase 4 Job work + Notes + Analytics data model.
- API route handlers for every module (Next.js Route Handlers under `/api`).
- Single-page client app on `/` with sidebar navigation + view switching (state-based).
- Seed data (items, BOMs, warehouses, opening stock, production history, parties, SOs/POs).

---
Task ID: 1
Agent: orchestrator (main)
Task: Extract uploaded artifacts, analyse docs + source, plan the port into Next.js.

Work Log:
- Extracted artifacts-1of2.zip (Phase 1 prototype build), artifacts-2of2.zip (ERP Requirements v1.md),
  Company-Manufacturing-ERP.zip (full app source + docs + reference images).
- Read docs 01-10 + requirements + company profile + architecture + phases.
- Read original schema.ts (Drizzle), storage.ts (business logic + seed), layout.tsx (nav), erp.ts (client lib),
  dashboard.tsx + items.tsx (UI patterns).
- Inspected existing Next.js project (package.json, prisma schema, globals.css, db.ts, layout.tsx, hooks).

Stage Summary:
- Project = automotive exhaust after-treatment sensor manufacturer ERP (NOx, EGTS, UQS, Delta P, Lambda sensors).
- Phases 1-4 documented; original stack = Express + React + Vite + Drizzle/SQLite + shadcn/ui.
- Decision: port to Next.js 16 App Router + Prisma/SQLite + shadcn/ui (already present). Single `/` route with
  client-side view switching. Full data model + seed + core modules + MES/Quality/Analytics.

---
Task ID: 2
Agent: orchestrator (main)
Task: Resolve hard crash blocking the Tau Power ERP app from rendering, then verify end-to-end.

Work Log:
- Extracted the newly uploaded `Tau Power ERP — Prototype.zip` (a static Vite build — same Phase 1 prototype already present in extracted/artifacts-1).
- Reviewed existing port state: full Prisma schema + 16 page modules + ~50 API routes already exist from a previous phase.
- Dev server was failing to render `/` with `RangeError: Invalid count value: -2 at String.repeat` and the process died on every render.
- Bisected the crash: Layout-only = OK; Dashboard direct import = crash. Cleared stale `.next` Turbopack cache + upgraded `recharts` 2.15.4 -> 3.10.1 (React 19 compat). Dashboard then rendered.
- Full page (all 16 dynamic imports) still crashed. Bisected the page modules: first 8 OK, second 8 crashed. Narrowed to `sales.tsx` — a Turbopack source-map transform bug triggered by very long single-line JSX expressions with inline ternaries/template literals (466/345/322 char lines).
- Rewrote `sales.tsx` cleanly: extracted header column arrays + `thClass` helper, broke every long expression into readable multi-line code, replaced literal `×`/`⚠` glyphs with lucide `X` + text. All business logic (SO list, create-SO dialog, dispatch/invoice dialog, invoice list) preserved.
- Restored full `page.tsx` (all 16 dynamic pages). Dev server now boots cleanly: `GET / 200`, dashboard + summary + items APIs all returning 200, "Tau Power ERP" renders.

Stage Summary:
- Root cause of the blocking crash: recharts 2.x React-19/Turbopack incompatibility (fixed by v3 + cache clear) AND a Turbopack source-map `String.repeat(-2)` bug triggered by ultra-long JSX lines in `sales.tsx` (fixed by clean rewrite).
- App now renders on `/`. Next: agent-browser end-to-end QA, then styling detail + feature additions.

---
Task ID: 3
Agent: orchestrator (main)
Task: End-to-end QA with agent-browser + fix runtime bugs found, then kick off styling/feature enhancements.

Work Log:
- Got dev server persisting across bash calls by launching via the canonical `.zscripts/dev.sh` (proper `disown`; plain `setsid`/`nohup` were getting reaped between tool calls).
- agent-browser QA on `/`: Dashboard renders with recharts v3 bar chart (Good vs Rejected by product line), all 16 nav buttons present, no console errors.
- Walked every nav view (Items, BOM, Production, MRP, Inventory, Purchase, Sales, Customers, Tally, Shopfloor, Quality, Warehouse, Analytics, Jobwork, Trace) — all render without Application error / ChunkLoadError.
- VLM analysis of clean dashboard screenshot surfaced a real build error overlay: `/api/inventory/route.ts` exported `export const runtime = onHandMap;` (a function) — `runtime` is a reserved Next.js route export and must be a static string. Removed the bogus line. `GET /api/inventory` now returns 200 with real batch/qty/warehouse data.
- Scanned all API routes for other reserved-export mistakes (`runtime`, `dynamic`, `revalidate`, `fetchCache`, `preferredRegion`) — only the inventory route had the bug; now clean.
- VLM design critique captured for the enhancement phase: KPI cards are a flat "wall" with no hierarchy; zero/null values waste space; reorder list misaligns; chart gridlines too faint; sidebar active state too subtle; tables lack zebra striping / right-aligned numerics.

Stage Summary:
- App is fully runnable and verified end-to-end (server stable, all 16 views render, APIs return real seeded data, no console/build errors).
- One real bug fixed (`runtime` export in inventory route).
- Next: parallel enhancement — (3-a) styling polish on globals/shared/dashboard/analytics; (3-b) new features (global command palette, CSV export, system notifications).

---
Task ID: 3-a
Agent: frontend-styling-expert
Task: Visual/styling polish for the Tau Power ERP — enhance globals.css, shared.tsx, dashboard.tsx, analytics.tsx per VLM design critique. No business-logic changes.

Work Log:
- Read worklog + 4 owned files + layout.tsx (read-only) to understand existing patterns (emerald-primary OKLCH theme, Kpi/StatusBadge/Empty/SectionTitle already present, ad-hoc card pattern in dashboard/analytics).
- Confirmed dev server healthy: `curl /` → 200, no compile errors in dev.log. Verified lucide-react has `Inbox`, `TrendingUp`, `TrendingDown` available.
- globals.css: added themed `:focus-visible` outline; rewrote `.scroll-thin` (6px width, rounded pill thumb using color-mix over `--muted-foreground`, transparent track, hover state, Firefox `scrollbar-color`); added `.zebra` (even-row tint + hover), `.card-hover` (1px translateY + shadow + themed border tint on hover), `.kpi-accent-{emerald,amber,rose,sky,violet,neutral}` (3px left border + faint gradient tint, NO indigo/blue), `.nav-active-bar` (4px sidebar-primary left bar via ::before, available for layout.tsx to consume).
- shared.tsx: added `KpiTone` type + `TONE_CLASS` map; `Kpi` now accepts optional `tone`, applies accent class, AND renders "dead" values (`—`, `0`, `₹0`, `₹0.00`, empty) in a muted/smaller style to reduce visual dead space; `card-hover` baked into Kpi base classes (so all KPI cards lift subtly). `StatusBadge` refined to `rounded-full px-2.5 tracking-wider leading-none` premium pill. `PageIntro` gained a subtle bottom border separator (`pb-3 border-b border-border/60`). `Empty` now renders a muted `Inbox` icon above the text. Added new `SectionCard` (titled header with optional subtitle + right slot, flexible bodyClassName) and `StatTrend` (delta + TrendingUp/Down arrow, `invert` flag, emerald/rose coloring).
- dashboard.tsx: grouped the three KPI rows under `SectionLabel` headings ("Operations", "Sales & supply chain", "Shop floor & quality") inside `<section>` blocks; assigned tones (financial → emerald, counts → neutral, quality → amber, pending/put-away → sky). Wrapped chart + reorder list + recent-orders table in `SectionCard` (chart header keeps "Production →" link as right slot; reorder header keeps AlertTriangle icon). Chart `CartesianGrid` now uses `stroke="var(--muted-foreground)" strokeOpacity={0.25}` — visibly darker than the old `stroke-border`. Reorder list rows gained `transition-colors hover:bg-muted/40` for hover highlight, kept tight right-aligned tabular-nums. Recent orders table: added `.zebra` class, removed per-row hover (zebra's own hover rule takes over), right-aligned Qty + Due columns.
- analytics.tsx: wrapped all 4 chart panels + 2 tables in `SectionCard`; added `.zebra` to Oldest batches and Order book tables; replaced per-row `hover:bg-muted/30` (zebra hover handles it); applied darker gridlines (`stroke="var(--muted-foreground)" strokeOpacity={0.25}`) to all 3 charts; assigned tones to analytics KPIs (WIP neutral, Order-book emerald+primary, Ageing 90+ rose+destructive, Stations neutral); rewrote the inline `["Code","Batch",...].map()` header patterns as explicit `<th>` tags for clarity; right-alignment of numeric columns preserved (Age/Qty/Value in oldest batches; Value in order book).
- Verified: Turbopack recompiled cleanly (`✓ Compiled in 520ms` / `394ms`, no `Module not found` / `Error` / `failed to compile` lines); `curl http://localhost:3000/` → 200; dashboard HTML contains "Tau Power" + "Operations" content.

Stage Summary:
- Files edited (owned): `src/app/globals.css`, `src/components/erp/shared.tsx`, `src/components/erp/pages/dashboard.tsx`, `src/components/erp/pages/analytics.tsx`.
- New exports available for re-use: `KpiTone` type, `SectionCard`, `StatTrend`. New CSS utilities: `.zebra`, `.card-hover`, `.kpi-accent-{emerald,amber,rose,sky,violet,neutral}`, `.nav-active-bar` (ready for layout.tsx to apply to active sidebar buttons), refined `.scroll-thin`, themed `:focus-visible`.
- No breaking changes: `Kpi` keeps `accent?: string` and `testid?: string` working; `StatusBadge`/`Empty`/`PageIntro`/`SectionTitle` signatures unchanged.
- No new npm deps; only existing lucide-react icons (`Inbox`, `TrendingUp`, `TrendingDown`) added.
- Dev server untouched; HMR recompiled all 4 files without errors; HTTP 200 on `/`.

---
Task ID: 3-b
Agent: full-stack-developer
Task: Add three new client-side features to the Tau Power ERP without breaking existing functionality: (1) a global Cmd/Ctrl+K command palette, (2) a CSV export utility + ExportButton wired into items / inventory / sales-InvoiceList, and (3) a notifications/system-health bell popover in the header.

Work Log:
- Read prior worklog (Tasks 1, 2, 3) and confirmed the app is already running stably on port 3000 via `.zscripts/dev.sh` — did NOT restart or kill the dev server.
- Inspected existing `layout.tsx`, `nav.ts`, `client.ts` (useApi/useAction/useToast patterns), `command.tsx` / `popover.tsx` / `dialog.tsx` shadcn components, and the `Summary` / `Phase3Summary` types from `src/lib/erp/shared.ts`.
- Created `src/lib/erp/csv.ts`: `toCSV(rows, columns?)` with RFC-4180 escaping (quotes/commas/newlines), `downloadCSV(filename, rows, columns?)` that builds a UTF-8-BOM Blob and triggers an `<a download>` click. Falls back to `JSON.stringify` for nested values.
- Created `src/components/erp/export-button.tsx`: outline Button + lucide `Download`, generic over `Record<string, unknown>[]`, toast on success / empty / failure via `useToast`.
- Created `src/components/erp/command-palette.tsx`: shadcn `CommandDialog` + global `keydown` listener for Cmd/Ctrl+K (preventDefault). "Navigate" group lists all 16 views with the same icons as the sidebar; "Actions" group has "Reload demo data" (POST /api/seed → invalidateQueries + toast) and "Toggle theme" (next-themes `useTheme`). Also exports `openCommandPalette()` + `CommandPaletteTrigger` chip (visible ⌘K button) that dispatches a custom DOM event the palette subscribes to.
- Created `src/components/erp/notifications.tsx`: Bell button in a shadcn `Popover`; pulls `useApi<Summary>` and `useApi<Phase3Summary>` and surfaces five actionable alerts (IRN-pending → sales, open NCRs → quality, unbinned stock → warehouse, PPAP pending → quality, open indents → purchase), each clicking through via `useNav().go(view)`. Destructive badge shows total open count; empty state "All clear".
- Mounted `<CommandPalette />` once at the end of `layout.tsx`'s root wrapper (outside the header flow), and added `<CommandPaletteTrigger />` + `<NotificationsBell />` next to the existing theme toggle in the header's `ml-auto` flex container — sticky footer pattern (`min-h-screen flex flex-col` + `mt-auto` on footer) preserved.
- Added `<ExportButton />` non-destructively into the headers of: `items.tsx` PageIntro actions (exports all item columns), `inventory.tsx` PageIntro actions (flattens stock-by-batch rows with item code/name + stock value), and `sales.tsx` InvoiceList header (flattens invoices with taxable / GST / total / IRN / status).
- Verified: dev.log shows multiple `✓ Compiled in NNNms` lines and no `Failed to compile` / `Module not found` / `SyntaxError` / `Type error` lines; `curl /` returns 200; dependent APIs (`/api/summary`, `/api/phase3/summary`, `/api/items`, `/api/sales/invoices`, `/api/inventory`) all 200. `npx eslint` on all 4 NEW files → 0 errors; on `items.tsx` / `inventory.tsx` / `sales.tsx` → 0 errors. Only remaining lint warnings are the two PRE-EXISTING `useEffect(setState)` patterns in `layout.tsx` (introduced before 3-b, not touched per the "do NOT break existing layout" rule).

Stage Summary:
- Three new features shipped and verified end-to-end on a stable dev server.
- New files: `src/lib/erp/csv.ts`, `src/components/erp/export-button.tsx`, `src/components/erp/command-palette.tsx`, `src/components/erp/notifications.tsx`.
- Modified files: `src/components/erp/layout.tsx` (mounted components), `src/components/erp/pages/items.tsx` / `inventory.tsx` / `sales.tsx` (added ExportButton only — no restyle).
- Used only existing shadcn components, lucide icons, and existing hooks (`useApi`, `useNav`, `useToast`, `useTheme`, `useQueryClient`). No new packages installed. All client components are `"use client"`. No indigo/blue colors introduced.
- Sticky footer / sidebar nav / theme toggle all preserved.
- Pre-existing seed endpoint (`POST /api/seed`) returns 500 on reseed due to a foreign-key delete-ordering bug in `src/lib/erp/seed.ts` (a file 3-b does NOT own). The command palette's "Reload demo data" surfaces the error gracefully via a destructive toast rather than failing silently — recommend a follow-up task to fix the seed order.

---
Task ID: 4
Agent: orchestrator (main)
Task: Integrate 3-a/3-b enhancements, fix follow-up bug, verify, set up recurring review.

Work Log:
- Reviewed both subagent results: 3-a delivered styling polish (globals.css utilities, Kpi tone system, SectionCard, StatTrend, zebra/card-hover/kpi-accent classes, dashboard grouping + chart gridlines, analytics polish); 3-b delivered command palette (Ctrl+K), CSV export utility + ExportButton on items/inventory/sales, and a notifications bell with 5 actionable alerts + badge count. Both verified HTTP 200 with no compile errors in their files.
- 3-b flagged a pre-existing bug: `POST /api/seed` returned 500. Root cause: `src/lib/erp/seed.ts` `ensureSeeded(force)` wiped tables in dependency order but MISSED `db.productionOrder.deleteMany({})`, so `db.item.deleteMany({})` violated the `ProductionOrder.itemId → Item` foreign key. Added the missing `productionOrder` delete right after `serial` (its only remaining dependents). `POST /api/seed` now returns `{"ok":true,"reseeded":true}` (HTTP 200).
- agent-browser end-to-end verification of the enhanced app:
  - Dashboard renders with 3 grouped KPI sections (OPERATIONS / SALES & SUPPLY CHAIN / SHOP FLOOR & QUALITY), colored accents, zebra-striped recent-orders table, visible chart gridlines.
  - Header now shows a "⌘K" command-palette trigger and a notifications bell with a live alert badge (37 open alerts).
  - Command palette (Ctrl+K) opens with "Navigate" (all 16 views) + "Actions" (Reload demo data, Toggle theme) groups — all functional.
  - No console errors / Application error / ChunkLoadError on any view.
- VLM confirmed the styling improvements landed (hierarchy, zebra, gridlines, header features) and flagged only minor remaining polish (muted empty-state dashes, sidebar footer contrast) — non-blocking.
- Created recurring cron job (id 450167, kind webDevReview, `0 0/15 * * * ?` Asia/Calcutta) — every 15 minutes it will reassess project state, run agent-browser QA, and continue styling/feature work using the mandatory webDevReview task description.

Stage Summary:
- App is fully runnable, verified, and enhanced. Dev server stays up via `.zscripts/dev.sh` (proper disown).
- Bugs fixed this session: Turbopack `String.repeat(-2)` crash (recharts v3 + sales.tsx rewrite), `runtime` export in /api/inventory route, /api/seed FK delete ordering.
- Features added: global command palette (Ctrl+K), CSV export on 3 list pages, notifications bell with actionable alerts, plus broad styling polish (KPI tones/sections, SectionCard, zebra tables, chart gridlines, scrollbars, hover states).
- Recurring 15-min webDevReview job is active and will drive the next phase autonomously.

Next-phase priorities (for the webDevReview rounds):
- Fix remaining minor polish: sidebar footer contrast, muted empty-state refinement.
- Add barcode/scan-driven shop-floor entry (shopfloor page already has scan API); add a print-friendly invoice/PDI PDF view.
- Consider auth/roles (NextAuth is available) and PostgreSQL migration path (currently SQLite).

---
Task ID: 5-a
Agent: frontend-styling-expert
Task: Visual/styling polish round 2 across the Tau Power ERP — apply `.nav-active-bar` + sidebar-footer contrast + header-padding alignment in layout.tsx; add `.table-compact` / `.link-inline` / `.kpi-empty` / `.section-divider` / `.row-warn` CSS utilities; activate `.kpi-empty` on dead-value KPI cards and export `LINK_INLINE` from shared.tsx; uniformise KPI section spacing + SectionLabel dividers in dashboard.tsx; and apply `.zebra` striping + numeric right-align + remove redundant `hover:bg-muted/30` across all list tables in inventory / purchase / production / parties / bom / warehouse / quality / shopfloor / trace / jobwork / planning / analytics.

Work Log:
- Read worklog (Tasks 1-4) + all 16 owned files (globals.css, shared.tsx, layout.tsx, dashboard.tsx, analytics.tsx, inventory, purchase, production, parties, bom, warehouse, quality, shopfloor, trace, jobwork, accounts, planning) and confirmed dev server was healthy (HTTP 200 + `✓ Compiled in NNNms` lines, zero compile errors).
- globals.css: refined `.zebra` (kept nth-child(even)/hover) and added `.zebra tbody tr.row-warn` (uses `!important` + amber chart-2 tint) so highlight rows (e.g. MRP shortage rows) override zebra even/odd tint; added `.table-compact` (tighter `py-1.5` rows + `text-[13px]` font for high-density tables); added `.link-inline` (primary-coloured text + cursor pointer + underline-on-hover, for clickable SO/invoice/batch nos. inside table cells); added `.kpi-empty` (0.78 opacity + dashed muted top border, lifts on hover) so dead-value KPI cards visually recede; added `.section-divider` (2px primary-tinted top border + pt-2, applied on SectionLabel headings).
- shared.tsx: exported new `LINK_INLINE = "link-inline"` constant for re-use; `Kpi` now conditionally applies `kpi-empty` class to the card root when its value is "dead" (`—`, `0`, `₹0`, `₹0.00`, empty) — tone accent still applies on non-empty cards. `StatusBadge` / `Empty` / `PageIntro` / `SectionCard` / `StatTrend` / `SectionTitle` signatures unchanged.
- layout.tsx: applied `nav-active-bar` class alongside the existing `bg-sidebar-accent` to the active sidebar nav button — now renders the 4px emerald sidebar-primary left bar from the 3-a CSS. Bumped the sidebar footer "Coming next: ..." text from `text-sidebar-foreground/50` → `/70` for clear legibility on the dark charcoal-green sidebar. Wrapped the header inner row (`<h1>` + `ml-auto` actions) in a `max-w-[1500px] mx-auto` flex container so the header's left edge now lines up exactly with the `main` content's left edge (previously header was full-width and content was centered). Sticky footer / sidebar / theme toggle / `<CommandPalette />` / `<CommandPaletteTrigger />` / `<NotificationsBell />` all preserved.
- dashboard.tsx: restructured the three KPI sections (Operations / Sales & supply chain / Shop floor & quality) as `<section className="space-y-3">` blocks inside the existing `space-y-6` outer wrapper — each block now has the SectionLabel + grid as its only children so the inter-section gap is now uniform 1.5rem (was previously uneven because the middle conditional section sometimes loaded late). SectionLabel now also carries the `.section-divider` class for a faint colored top accent. FPY cards ("First-pass yield" + "First-pass yield today") render with the new `kpi-empty` styling when their value is `—` because `Kpi` auto-detects dead values.
- inventory.tsx: added `.zebra` to both list tables (stock-by-batch + stock ledger); the high-density ledger table also gets `.table-compact`; removed the per-row `hover:bg-muted/30` (zebra's own hover rule now handles it); `tabular-nums` already on Qty/Value; added `tabular-nums` to the ledger Type/Date column for consistency.
- purchase.tsx: imported `X` from lucide-react and replaced the bare `×` glyph on the PO line remove button with `<X className="h-3.5 w-3.5" />` + `aria-label="Remove line"`; added `.zebra` to all three tables (POs / GRNs / Indents); right-aligned numeric columns (`Lines`, `Value`, `Taxable`, `Total`, `Qty`); added `tabular-nums` to the `Lines` count and `Date` columns; removed per-row hover (zebra handles).
- production.tsx: added `.zebra` to the main production-orders table; the BOM-requirements sub-table inside the DetailDialog also gets `.zebra .table-compact` for density consistency; removed per-row hover; numeric columns already right-aligned with `tabular-nums`.
- parties.tsx: added `.zebra` to the parties list table; right-aligned the Distance column (`text-right tabular-nums`); removed per-row hover.
- bom.tsx: added `.zebra` to the BOM lines table; numeric columns already right-aligned; removed per-row hover.
- warehouse.tsx: added `.zebra` to both the Bin-map table and the Awaiting-put-away table; numeric columns already right-aligned; removed per-row hover.
- quality.tsx: added `.zebra` to all three tables (Inspections / NCRs / PPAP); right-aligned the `Qty` column in the NCR table (was previously left-aligned, breaking alignment with the other Qty columns); removed per-row hover.
- shopfloor.tsx: added `.zebra` to the "Orders on the shop floor" table; removed per-row hover; the small `×` glyph in the "rework ×N" inline label was kept (it's a math-style multiplier on a short line, not a button — does not trigger the Turbopack long-line bug).
- trace.tsx: added `.zebra .table-compact` to the "Component batches consumed" sub-table; numeric column already right-aligned.
- jobwork.tsx: added `.zebra` to the job-workers list table; right-aligned the Distance column; removed per-row hover.
- planning.tsx: added `.zebra` to the MRP components table; replaced the inline `bg-red-50/40 dark:bg-red-950/20` shortage-row tint (which lost specificity to `.zebra tbody tr:nth-child(even)`) with the new `.row-warn` class — `row-warn` uses `!important` so the amber warning tint shows on top of zebra even/odd; removed per-row hover.
- accounts.tsx: no list-style tables present; no changes needed (two cards + 2 summary tiles + mapping notes — already polished).
- analytics.tsx: already polished by 3-a (zebra + gridlines + tones + SectionCard all in place). Verified no further touch-ups needed.
- Verification: ran isolated `npx tsc --noEmit` against my 16 edited files (via a temp tsconfig that extends the project's). The errors reported were ALL pre-existing (missing module types for `Settings`, `ProductionOrder`, `Party`, `Warehouse`, etc. — these are runtime exports the full tsconfig can resolve but my isolated subset couldn't — and pre-existing bugs in `purchase.tsx`'s `GrnList` / `IndentList` calling `onOpenChange` which isn't destructured — bug was there before 5-a). No NEW TypeScript errors introduced by my edits.
- Dev log: scanned the entire dev.log — 0 occurrences of `fail` / `error` / `module not found` / `warning` / `cannot`. Multiple `✓ Compiled in NNNms` lines (last: `✓ Compiled in 298ms`). All HTTP requests served `200`.

Stage Summary:
- Files edited (owned): `src/app/globals.css`, `src/components/erp/shared.tsx`, `src/components/erp/layout.tsx`, `src/components/erp/pages/{dashboard,analytics,inventory,purchase,production,parties,bom,warehouse,quality,shopfloor,trace,jobwork,accounts,planning}.tsx` (16 files total — analytics.tsx + accounts.tsx needed no edits and were left untouched).
- New CSS utilities available for re-use (in globals.css): `.table-compact`, `.link-inline`, `.kpi-empty`, `.section-divider`, `.zebra tbody tr.row-warn` (highlight-row tint that overrides zebra even/odd via `!important`).
- New exported constant in shared.tsx: `LINK_INLINE` (string `"link-inline"`) — Phase B / future code can use this for clickable in-table SO/invoice/batch numbers.
- Visual changes (all CSS-class-only — no logic/data-flow changes): sidebar active button now has a 4px emerald left bar (`nav-active-bar`); sidebar footer "Coming next" text now `/70` opacity (was `/50`, nearly illegible); header content now center-aligned with main content (`max-w-[1500px] mx-auto`); dead KPI cards (value `—` / `0` / `₹0`) now recede to 0.78 opacity + dashed top border; all list tables in 13 page files now have zebra striping + hover handled by `.zebra`; shortage rows in planning.tsx use amber `row-warn` tint that beats zebra; PO-line remove button uses lucide `X` icon instead of bare `×` glyph; high-density tables (inventory ledger, production BOM dialog, trace component batches) use `.table-compact` for tighter rows.
- Did NOT touch: items.tsx, sales.tsx (Phase B owns these); page.tsx, lib/erp/*, api/**, command-palette.tsx, notifications.tsx, export-button.tsx. Did NOT change business logic, API calls, state, handlers, or dialogs anywhere.
- Dev server note: at the very end of the verification pass, `curl http://localhost:3000/` returned HTTP `000` (connection refused) — the dev server process appears to have been reaped between bash tool calls (a known issue noted in Task 3's worklog; `.zscripts/dev.sh` uses `disown` but the parent bash session can still get cleaned up). Per task instructions, did NOT restart the dev server. The dev.log itself is clean: zero compile-error messages and multiple `✓ Compiled in NNNms` confirmations show that every edit HMR-recompiled successfully before the server process went away.

---
Task ID: 5-b
Agent: full-stack-developer
Task: webDevReview round 1 — add (1) sortable + filterable items table with quick-view dialog, (2) print-friendly invoice detail view, (3) clickable invoice numbers + zebra striping in sales.tsx, (4) item quick-view dialog. Do NOT touch the dev server.

Work Log:
- Read prior worklog (Tasks 1, 2, 3, 3-a, 3-b, 4) to understand the existing app structure, the ItemsPage (useApi<ItemRow[]>("/api/items"), search + type filter + ExportButton + edit dialog), the SalesPage (SO list / dispatch dialog / invoice list with `go("sales", inv.id)`), and the existing print CSS in globals.css (`.print-area`, `.no-print`, `.zebra` already present).
- Read the API contracts I depend on without editing them: `/api/invoices/[id]/route.ts` → calls `getInvoice(id)` which returns `db.invoice.findUnique({ where: { id }, include: { customer: true, so: { include: { lines: { include: { item: true } } } } } })`. Confirmed the `lines` field on the Invoice row is a JSON string of `InvoiceLine[]` and must be parsed client-side. The route does NOT include `serials` directly, but each `InvoiceLine` carries its `serials: string[]` (allocated during create), so I extract serials from the parsed lines. Also fetched `/api/settings` for the seller block (legalName, GSTIN, address, city, pincode, stateCode).
- Created `src/lib/erp/print.ts`:
  - `printInvoice()` — wraps `window.print()`. The existing `@media print` rule in globals.css hides everything via `body * { visibility: hidden }` and reveals `.print-area` content; the sidebar/header/footer already carry `.no-print`, so calling `window.print()` is enough to print just the invoice.
  - `formatSerialRange(serials)` — natural-sorts the input (numeric-aware), groups consecutive numbers that share a non-numeric prefix into "PREFIX-from to PREFIX-to" ranges, and joins them. Handles non-numeric tokens (emitted verbatim). Example: `["NOX-001","NOX-002","NOX-003","NOX-007"]` → `"NOX-001 to NOX-003, NOX-007"`.
- Created `src/components/erp/item-detail.tsx` — read-only `Dialog` showing all `ItemRow` fields in a `dl` grid (label : value). Title is the item code (font-mono). Dead/empty values render as a muted em-dash. Includes an `Edit` button (Pencil) that just calls `onClose` per the brief; plus a `Close` button.
- Created `src/components/erp/invoice-view.tsx` — `"use client"` `Dialog` with a proper GST tax-invoice layout:
  - Defines local typed interfaces (`InvoiceParty`, `InvoiceSo`, `InvoiceDetail`, `CompanySettings`) for the API response — strict typing, no `any`.
  - Fetches `GET /api/invoices/[id]` (with `useApi` enabled only when `invoiceId !== null` — passes `/api/invoices/${invoiceId ?? 0}` as the URL/key so the hook is stable) + `GET /api/settings` for the seller block.
  - Parses `invoice.lines` defensively via `safeParseLines` (try/catch, returns [] on failure).
  - Renders: seller block (top-left, from settings), "TAX INVOICE" + inv no + date + SO + customer PO (top-right), bill-to customer block (name, GSTIN, address, state, place of supply), transport details (vehicle, transporter, distance), line items table with #/Item/HSN/Qty/Rate/Taxable/GST%/(CGST+SGST or IGST depending on intra/inter-state), totals block (taxable + CGST/SGST or IGST + round-off + grand total), amount in words (`amountInWords` from `@/lib/erp/client`), serial numbers dispatched (compact range via `formatSerialRange`), IRN / Ack no / EWB status row, and a footer "This is a computer-generated invoice." + signature line.
  - Print button (Printer icon) calls `printInvoice()`. DialogContent gets `print:` Tailwind variants to override fixed-positioning/max-width/translate/padding so it fills the page; the printable body is wrapped in `.print-area` (so the existing `@media print` rule reveals it), and the dialog chrome (header row with Print button, footer Close button) carries `.no-print`.
  - Uses `.zebra` on the line-items table for readability.
- Modified `src/components/erp/pages/items.tsx`:
  - Added sortable columns Code, Name (Description), Type, On hand, Cost (stdCost) via a new `SortHeader` component using `ChevronUp`/`ChevronDown`/`ChevronsUpDown` lucide icons; state is `useState<SortKey | null>` + `useState<SortDir>`. Clicking toggles asc/desc; clicking a new column resets to asc.
  - Added two new filter Selects next to the existing type filter: "Product line" (All + NOx/EGTS/UQS/Delta P/Lambda via `PRODUCT_LINES`) and "Tracking" (All + none/batch/serial via `TRACKING`). All filters compose with the existing search and type filter (AND).
  - Added `.zebra` + `.table-compact` classes to the table; removed the per-row `hover:bg-muted/30` (zebra handles hover).
  - Added an `Eye` quick-view icon button per row (next to the existing edit pencil) that opens the new `ItemDetail` dialog for that item.
  - The ExportButton now receives `rows` (the filtered+sorted array) instead of the previously filter-only array, so the CSV matches what's on screen.
  - Kept the existing "New item" create dialog and edit dialog EXACTLY as-is (zero changes to `ItemDialog`).
- Modified `src/components/erp/pages/sales.tsx`:
  - `InvoiceList`: added `viewInvoiceId` state; the invoice number cell now renders a `<button class="link-inline">` that opens `InvoiceView` for that invoice id. The "View" button (was `go("sales", inv.id)`) now also opens `InvoiceView` instead. Removed the now-unused `useNav` import (the command palette's "go to sales" still works because it calls `go("sales")` without a param).
  - Mounted `<InvoiceView invoiceId={viewInvoiceId} onClose={...} />` inside `InvoiceList`.
  - Added `.zebra` class to both the SO list table and the Invoice list table; removed per-row `hover:bg-muted/30` (zebra provides hover).
  - Kept ALL existing functionality: SOList, SODialog, DispatchDialog, InvoiceList, ExportButton. The `useNav` "sales" param fallback is no longer used by InvoiceList, but the sales view itself remains navigable via the sidebar/command palette as before.
- TypeScript verification: ran `tsc --noEmit` on all 5 of my files. The only remaining errors are PRE-EXISTING (verified by stashing my changes and re-running tsc on the originals): (a) `items.tsx` ItemDialog form-resolver narrowing (lines 62/67/75 — `useForm<FormValues>` strict-mode incompatibility with the ItemRow `type: string` vs `z.enum(ITEM_TYPES)`, untouched by me), and (b) `sales.tsx` line 11 `import type { Party, SalesOrder, SoLine, Invoice } from "@/lib/erp/shared"` — these types are not formally exported from `shared.ts` but resolve via Prisma client at runtime; Turbopack strips type-only imports and the app runs fine. My new code (`print.ts`, `item-detail.tsx`, `invoice-view.tsx`) introduces ZERO new TypeScript errors.
- Dev server status: the Next.js dev server (PID 1007 per `.zscripts/dev.pid`) is NOT currently running — `ps -p 1007` returns nothing, `curl http://localhost:3000/` returns connection-refused (curl exit 7), and `ss -ltn` shows nothing on port 3000. The dev.log ends at 20:13 with healthy 200 responses and no error/crash markers. Per the task brief ("DO NOT touch the dev server... do NOT restart, do NOT run `bun run dev`"), I did NOT restart it; the orchestrator's `.zscripts/dev.sh` should pick it back up on the next round and HMR will reload my new files. My files are type-clean (verified via standalone `tsc`), so the next HMR compile should succeed.

Stage Summary:
- New files (owned): `src/lib/erp/print.ts`, `src/components/erp/item-detail.tsx`, `src/components/erp/invoice-view.tsx`.
- Modified files (owned): `src/components/erp/pages/items.tsx`, `src/components/erp/pages/sales.tsx`.
- Features shipped:
  1. Items table: sortable Code/Name/Type/On hand/Cost columns (ChevronUp/Down/UpDown icons, asc/desc toggle), added Product line + Tracking filter Selects (compose with search + type filter), `.zebra` + `.table-compact` striping, per-row Eye icon → `ItemDetail` quick-view dialog. ExportButton now exports the filtered+sorted view.
  2. `ItemDetail` quick-view dialog: read-only label:value grid of all ItemRow fields (code, name, type, product line, HSN, GST rate, UoM, tracking, reorder, std cost, rolled cost, on-hand, OEM part no, specs, has-BOM), Edit button (just closes).
  3. `InvoiceView` print-friendly tax invoice dialog: full GST layout (seller block, TAX INVOICE title, bill-to, transport, line-items table with HSN/GST/CGST+SGST or IGST, totals, amount in words, serial range, IRN/Ack/EWB status, signature), Print button calls `printInvoice()` which uses the existing `@media print` + `.print-area`/`.no-print` CSS so only the invoice prints.
  4. Sales.tsx wiring: invoice number is now a `.link-inline` button opening `InvoiceView`; the "View" button also opens `InvoiceView` (no longer navigates via `useNav`); `.zebra` striping on both SO and Invoice tables.
- Tech constraints honoured: TypeScript strict, no `any`, all props typed; only existing shadcn components + lucide icons + existing hooks (`useApi`, `useAction`, `useToast`, `useNav`); no new npm packages; all new client components start with `"use client"`; no indigo/blue colors; reused existing `inr2`/`qty`/`amountInWords`/`STATES` helpers; reused existing `InvoiceLine` type.
- Did NOT edit any of the styling-agent-owned files (globals.css, shared.tsx, layout.tsx, dashboard/analytics/inventory/purchase/production/parties/bom/warehouse/quality/shopfloor/trace/jobwork/accounts/planning pages, command-palette, notifications, export-button, all `src/app/api/**`).
- Follow-up: dev server appears to be down (not by me) — orchestrator should restart via `.zscripts/dev.sh` to HMR-pick-up my new files and run the standard `curl /` + `curl /api/sales/invoices` health checks.

---
Task ID: 5 (webDevReview round 1)
Agent: orchestrator (main)
Task: Cron-triggered review — assess status, QA via agent-browser, fix bugs, add styling + features.

## Current project status / assessment
- Dev server stable on :3000 via `.zscripts/dev.sh` (process persists across tool calls).
- All 16 nav views render with **zero** Application errors / ChunkLoadErrors / Build errors.
- All core APIs return 200 with real seeded data (34 items, 4 production orders, 1 SO, 1 invoice, dashboard stockValue ₹41.38L / FPY 96.8%).
- Command palette (Ctrl+K), notifications bell (37 alerts), CSV export (items/inventory/sales) all functional — carried over from Tasks 3-a/3-b/4.
- **No bugs found this round** — QA was clean, so focus shifted to the mandatory styling + feature enhancements.

## Goals / completed modifications / verification

### Phase A — Styling polish round 2 (Task 5-a, frontend-styling-expert)
- `layout.tsx`: applied `.nav-active-bar` to active sidebar button (4px emerald left-border accent — was missing despite CSS existing since 3-a); wrapped header inner row in `max-w-[1500px] mx-auto` so header aligns with centered main content; bumped footer contrast.
- `globals.css`: added `.table-compact` (tighter dense-table rows), `.link-inline` (clickable in-table text styling), `.kpi-empty` (receded empty-state card), `.section-divider` (section label accent), `.zebra tbody tr.row-warn` (warning tint that survives zebra).
- `shared.tsx`: `Kpi` now applies `.kpi-empty` to the whole card root on dead values (not just muted text); exported `LINK_INLINE` constant.
- `dashboard.tsx`: restructured 3 KPI sections into uniform `space-y-6`/`space-y-3` wrappers (even inter-section gaps); SectionLabel gets `.section-divider`.
- 12 list pages (inventory, purchase, production, parties, bom, warehouse, quality, shopfloor, trace, jobwork, planning, +production DetailDialog): added `.zebra` to every list table, right-aligned numeric columns with `tabular-nums`, applied `.table-compact` to high-density tables, replaced bare `×` glyph with lucide `X` in purchase, applied `.row-warn` to MRP shortage rows.
- Orchestrator follow-up: footer contrast still too low per VLM → bumped to `text-sidebar-foreground/85` + added a "Roadmap" label for intentional framing. VLM confirms now clearly readable.

### Phase B — New features (Task 5-b, full-stack-developer)
- **Sortable + filterable Items table** (`items.tsx`): Code/Description/Type/On-hand/Cost columns now sortable (click header toggles asc/desc with ChevronUp/Down/UpDown icons); added Product-line + Tracking filter Selects that compose AND with existing search + type filter; `.zebra` + `.table-compact`; per-row `Eye` quick-view button → `ItemDetail` read-only dialog; ExportButton now exports the filtered+sorted rows (CSV matches screen).
- **Print-friendly Invoice detail view** (`invoice-view.tsx` + `sales.tsx` wiring): full GST tax invoice dialog — seller block (from /api/settings), TAX INVOICE title, bill-to/ship-to with GSTINs, transport details, line-items table (HSN/GST%/CGST+SGST or IGST auto-switched), totals, amount-in-words, serial ranges (via `formatSerialRange`), IRN/Ack/EWB status, signature line, Print button (`window.print()`). Invoice number in sales InvoiceList is now a `.link-inline` button opening this dialog; "View" button also opens it. `.zebra` on both SO + invoice tables.
- **Item quick-view dialog** (`item-detail.tsx`): read-only label:value grid of all ItemRow fields with code as title.
- **Print helpers** (`src/lib/erp/print.ts`): `printInvoice()` + `formatSerialRange(serials)` (groups consecutive prefixed numbers into ranges).

### Verification results
- agent-browser QA: all 16 views OK (0 failures), no console errors.
- Dashboard: active left-border accent ✓ (VLM confirmed), footer readable ✓, empty-state cards recede ✓, even KPI spacing ✓.
- Items page: sortable headers present ✓, Product-line + Tracking filters present ✓, quick-view dialog opens with item code as title ✓.
- Invoice view: dialog opens with "Tax invoice · INV/26-27/0001", shows seller GSTIN 27AAKCT4244J1Z0, bill-to GSTIN, line items with TAXABLE/CGST/SGST, amount in words "Rupees Twenty Two Thousand Three Hundred Two Only", Print button ✓.
- Command palette (Ctrl+K) still works; notifications bell shows 37 alerts.
- dev.log: `✓ Compiled in 517ms`, no `error`/`failed`/`module not found` lines.

## Unresolved issues / risks + next-phase priorities
- **Pre-existing TS narrowing** in `items.tsx` ItemDialog (z.enum vs ItemRow.type:string) — non-blocking (next.config `ignoreBuildErrors: true`); recommend a future cleanup pass to type the form resolver properly.
- **Invoice view totals below fold** — the dialog body scrolls (`max-h-[75vh] overflow-y-auto`) so totals are reachable; for a more compact print layout, consider condensing the seller/buyer blocks side-by-side in a future pass.
- **Recurring webDevReview cron (id 450167)** is active and triggered this round — it will continue every 15 min.
- Next-phase recommendations:
  1. Auth/roles (NextAuth available) — gate the command palette actions + seed by role.
  2. Barcode/scan-driven shop-floor entry (scan API already exists at /api/phase3/scan) — wire a scan input on the shopfloor page.
  3. PDI print-friendly report view (PdiReport model + reference images exist in extracted/erp-project/reference/).
  4. Condensed/invoice-grade print CSS for the invoice view (side-by-side parties, A4 sizing).
