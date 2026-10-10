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
