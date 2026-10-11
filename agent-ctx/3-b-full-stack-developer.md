# Task 3-b — full-stack-developer (features)

## Brief
Port parallel feature work for the Tau Power ERP (Next.js 16 + Prisma + shadcn).
Built: global Cmd/Ctrl+K command palette, CSV export utility + ExportButton, and a
notifications / system-health bell popover. Mounted everything in `layout.tsx`
without disturbing the sticky footer / sidebar / existing nav behaviour.

## What I own (and did NOT touch outside this list)
- NEW `src/lib/erp/csv.ts`                       — toCSV + downloadCSV (RFC-4180 escaping, BOM, anchor download)
- NEW `src/components/erp/export-button.tsx`      — outline Button + Download icon, toast on success/error
- NEW `src/components/erp/command-palette.tsx`    — CommandDialog wrapped, Cmd/Ctrl+K + custom event open
- NEW `src/components/erp/notifications.tsx`      — Bell popover, badge = total open alerts, navigates on click
- MOD `src/components/erp/layout.tsx`             — mounted CommandPalette + CommandPaletteTrigger + NotificationsBell
- MOD `src/components/erp/pages/items.tsx`       — added ExportButton (non-destructive, kept existing header)
- MOD `src/components/erp/pages/inventory.tsx`   — added ExportButton (flattened stock rows + item code/name lookup)
- MOD `src/components/erp/pages/sales.tsx`       — added ExportButton inside InvoiceList header (flattened invoice rows)

Did NOT touch (other agent owns): `src/app/globals.css`, `src/components/erp/shared.tsx`,
`src/components/erp/pages/dashboard.tsx`, `src/components/erp/pages/analytics.tsx`,
all `src/app/api/**`, `src/lib/erp/service.ts`, `src/lib/erp/seed.ts`, `src/lib/erp/shared.ts`.

## Implementation notes
- `toCSV` handles strings, numbers, booleans, bigint, Date, and falls back to `JSON.stringify`
  for nested objects; wraps cells containing `,` `"` `\n` `\r` in double quotes and doubles
  inner quotes (RFC 4180). Prepends a UTF-8 BOM for Excel friendliness.
- `downloadCSV` builds a Blob + temporary `<a download>` (no external deps).
- `ExportButton` is generic over `Record<string, unknown>[]`; pages pass typed CSV rows with
  an explicit `columns` array (so nested objects like `customer` aren't serialized as `[object Object]`).
- Command palette uses the existing `@/components/ui/command` (`CommandDialog`) wrapped over
  the shadcn `Dialog`. Cmd+K / Ctrl+K opens via a global keydown listener with `preventDefault`.
  Also exposes `openCommandPalette()` + a `CommandPaletteTrigger` chip (visible ⌘K button in header)
  that dispatches a custom DOM event the palette listens to. Close on Escape / selection /
  backdrop click is provided by the underlying Radix Dialog for free.
  - Navigation group lists all 16 views with the same icons as the sidebar.
  - Actions group: "Reload demo data" (POST /api/seed → `qc.invalidateQueries()` + toast),
    "Toggle theme" (next-themes `useTheme`).
- Notifications bell uses `useApi<Summary>` + `useApi<Phase3Summary>` (already exist).
  Alerts surfaced (each click → `useNav().go(view)`):
    - Invoices awaiting IRN → sales     (summary.irnPending)
    - Open NCRs              → quality   (phase3.openNcrs)
    - Stock to put away      → warehouse (phase3.unbinned)
    - PPAP pending            → quality   (phase3.ppapPending)
    - Open indents           → purchase  (summary.openIndents)
  Destructive badge count = sum of all open alerts; shows "All clear" empty state when 0.
- Layout sticky-footer pattern preserved: root `min-h-screen flex`, header `sticky top-0`,
  `<main className="flex-1">`, `<footer className="mt-auto">`. Bell + chip + theme toggle
  sit in the existing `ml-auto` flex container — only adds nodes, doesn't change the flex chain.
- Used only existing shadcn components (Button, Badge, Popover, Skeleton, Command/Dialog),
  lucide-react icons, existing hooks (useApi, useNav, useToast, useQueryClient, useTheme).
  No new packages installed.

## Verification
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → **200**
- Tail of `/home/z/my-project/dev.log` shows multiple `✓ Compiled in NNNms` lines with no
  `Failed to compile`, `Module not found`, `SyntaxError`, or `Type error` lines.
- Dependent APIs all 200:
    /api/summary 200, /api/phase3/summary 200, /api/items 200,
    /api/sales/invoices 200, /api/inventory 200
- `npx eslint` on the 4 NEW files (csv.ts, export-button.tsx, command-palette.tsx,
  notifications.tsx) → **0 errors / 0 warnings**.
- `npx eslint` on sales.tsx, items.tsx, inventory.tsx → **0 errors / 0 warnings**.
- The only remaining lint errors in `layout.tsx` (`useEffect(() => setMounted(true), [])` and
  `useEffect(() => setOpen(false), [view])`) are PRE-EXISTING patterns from before this task —
  not introduced by 3-b. Did not touch them per "do NOT break existing layout" instruction.
- `/api/seed` (POST) currently returns 500 — that's a foreign-key ordering bug in
  `src/lib/erp/seed.ts` (a file I do NOT own). The command palette surfaces it gracefully
  via the existing `useToast` error toast ("Reload failed" + the Prisma message) rather than
  silently failing.

## Files changed
NEW:
- src/lib/erp/csv.ts
- src/components/erp/export-button.tsx
- src/components/erp/command-palette.tsx
- src/components/erp/notifications.tsx
MOD:
- src/components/erp/layout.tsx
- src/components/erp/pages/items.tsx
- src/components/erp/pages/inventory.tsx
- src/components/erp/pages/sales.tsx
