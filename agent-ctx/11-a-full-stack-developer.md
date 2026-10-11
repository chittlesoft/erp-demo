# Task 11-a — full-stack-developer (webDevReview round 7)

## Brief
Polish the change-password UX (eye-toggle, strength meter, clearer disabled
state), add a My Profile page, and add activity-log CSV export + date-range
filtering. Coordinated with parallel styling agent 11-b — I did NOT touch any
of 11-b's owned files (globals.css, shared.tsx, layout.tsx, other pages/*,
invoice-view, item-detail, pdi-*, command-palette, notifications, export-button,
login-page, api.ts lib, all other API routes, schema.prisma).

## What I own (and did NOT touch outside this list)
- MOD `src/components/erp/change-password.tsx`     — UX polish (eye-toggle, strength meter, disabled hints)
- NEW `src/components/erp/pages/profile.tsx`       — My Profile page
- MOD `src/lib/erp/nav.ts`                          — add "profile" to View union
- MOD `src/app/page.tsx`                            — profile dynamic import + view switch
- MOD `src/components/erp/user-menu.tsx`            — "My profile" menu item
- MOD `src/components/erp/activity-feed.tsx`       — CSV export + date-range filter
- MOD `src/app/api/activity/route.ts`              — from/to/user query params
- MOD `src/lib/erp/activity.ts`                     — listActivity accepts from/to/user (parameterised SQL)

## Dependencies I relied on (read-only)
- `@/lib/erp/csv` — `downloadCSV` + `toCSV` + `CsvColumn` (reused for the activity export; no new helper file needed)
- `@/lib/erp/client` — `useApi` hook for React Query fetching
- `@/lib/erp/auth-shared` — `asRole`, `isAdmin`, `ROLE_LABEL`, `Role`
- `@/components/erp/shared` — `SectionCard`, `PageIntro`, `StatusBadge`
- `@/lib/erp/api` — `api()` route wrapper

## What I changed

### `src/lib/erp/activity.ts` — extended `listActivity` with optional date/user filters
- New signature: `listActivity(limit?, module?, from?, to?, user?)`.
- Composed WHERE clauses via `Prisma.sql` fragments pushed into a `conds` array
  then joined with `Prisma.join(conds, " AND ")` — fully parameterised, no
  string concatenation, no SQL injection.
- Added `normaliseFrom`/`normaliseTo` helpers — bare `YYYY-MM-DD` inputs (from
  HTML `<input type="date">`) become `YYYY-MM-DDT00:00:00.000Z` /
  `YYYY-MM-DDT23:59:59.999Z` so a single-day `to` filter captures the entire
  day, not just midnight.
- Backward-compatible: existing 1-arg / 2-arg callers keep working (all new
  params are optional).

### `src/app/api/activity/route.ts` — read new query params
- Added `from`/`to`/`user` URLSearchParams reads + forwards to `listActivity`.

### `src/components/erp/change-password.tsx` — UX polish (full body rewrite)
- **Per-field eye-toggle**: `showCurrent`/`showNew`/`showConfirm` useState
  booleans. Each input has a right-aligned `Eye`/`EyeOff` lucide icon button
  that toggles `type="password"` ↔ `type="text"`. Extracted a reusable
  `PasswordField` component to keep the three fields DRY.
- **Strength meter** on the New Password field: `computeStrength(pw)` returns
  0..4 (length≥8 +1, lowercase +1, digit +1, uppercase-or-symbol +1). 4-segment
  bar with colour-coded fills:
  - 0 → muted, "—"
  - 1 → rose, "Weak"
  - 2 → amber, "Fair"
  - 3 → sky, "Good"
  - 4 → emerald, "Strong"
  Plus a `<StrengthMeter>` component with `aria-live="polite"` for screen
  readers.
- **Clearer disabled state**: Save button stays disabled until all 3 fields
  filled AND new.length ≥ 6 AND new === confirm. Added inline validation hints
  below each field (too-short, mismatch, "fill in all three fields") plus a
  single summary hint near the footer explaining the current blocker.
  Added `opacity-60 cursor-not-allowed` className when disabled for extra
  visual clarity beyond shadcn's default `opacity-50`.
- All existing POST logic (session-gated `/api/auth/change-password`, sha256
  verify + rehash via `hashPassword`, toast on success/error, close-on-success,
  field reset on reopen) preserved.

### `src/components/erp/pages/profile.tsx` — NEW My Profile page
- `"use client"` page using `useSession()`. Available to ALL signed-in users
  (not admin-gated).
- **Identity card** (`SectionCard`): avatar circle with initials, name + email
  + role badge, plus an info list with `Mail`/`Hash`/`ShieldCheck`/`Activity`
  icons for Email, User id, Role, Account status (ACTIVE badge via
  `StatusBadge`).
- **Change password button** (in the page-intro actions + inside the card)
  opens `ChangePasswordDialog` (imported, not re-implemented).
- **Recent activity by me** (`SectionCard`): fetches
  `/api/activity?limit=10&user=<email>` (server-side user filter, so we only
  pay for this user's rows) and renders a compact timeline using the same
  colour tones as `activity-feed.tsx` (emerald/amber/rose/sky/violet/neutral
  dots + module badge + refId). Reuses `relativeTime` logic.
- Uses `PageIntro`, `SectionCard`, `StatusBadge`, `Button`, `Badge`,
  `Skeleton` — all from existing shadcn/shared.

### `src/lib/erp/nav.ts` — added "profile" to View union
- One-line change: `... | "users" | "profile"`.

### `src/app/page.tsx` — wired profile view
- `const Profile = dynamic(() => import("@/components/erp/pages/profile"))`.
- `{view === "profile" && <Profile />}` switch added.

### `src/components/erp/user-menu.tsx` — added "My profile" menu item
- Imported `useNav` from `@/lib/erp/nav` + selected `go` via `useNav((s) => s.go)`.
- Added a `DropdownMenuItem` (lucide `UserCircle2` icon) before "Change
  password" that calls `go("profile")` on select. Available to ALL signed-in
  users (not admin-gated).

### `src/components/erp/activity-feed.tsx` — CSV export + date-range filter
- **Date-range filter**: a new row below the module chips with two
  `<Input type="date">` for `from`/`to`, cross-linked via `min`/`max` so the
  user can't pick an inverted range. A "Clear" button (lucide `X` icon)
  appears only when at least one date is set. Changing either re-fetches
  via the `useApi(key)` URL — React Query's `queryKey: [key]` triggers the
  refetch automatically.
- **CSV export button**: a "Export CSV" button (lucide `Download` icon) in
  the drawer header, **admin-only** (gated via `useSession()` + `isAdmin()`).
  Disabled while exporting or when rows.length === 0. On click: fetches
  `/api/activity?...&limit=200` (the API max) with the current filter
  params, then calls `downloadCSV("activity-log-...", rows,
  ACTIVITY_CSV_COLUMNS)` from `@/lib/erp/csv`. Filename includes the module
  + date range so multiple exports are distinguishable in the downloads
  folder. CSV columns: ID, Timestamp, Module, Action, Ref Type, Ref ID,
  Ref ID (int), Title, Detail, User.
- All existing module filter chips + timeline preserved. Footer now also
  shows the active date range.

## Verification
- `eslint` on all 8 owned files → exit 0, no warnings, no errors.
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → **200** ✓
- `curl -s "http://localhost:3000/api/activity?limit=3&from=2026-10-01&to=2026-10-31"` → **200** + JSON array ✓
- `curl -s "http://localhost:3000/api/activity?limit=3&user=admin@taupower.in"` → **200** + JSON array ✓
- dev.log shows the parameterised SQL: `WHERE ts >= ? AND ts <= ?` (date filter)
  and `WHERE user = ?` (user filter). No string concatenation in the query.
- Turbopack HMR recompiles succeeded (`✓ Compiled in NNNms`) after every
  file edit. No `Failed to compile` / `Module not found` / `Type error` /
  `SyntaxError` lines attributed to my files.

## Stage Summary
- **Change-password UX polished**: per-field eye-toggle, 4-segment strength
  meter (rose/amber/sky/emerald), inline validation hints + clearer disabled
  Save button. All existing POST logic preserved.
- **My Profile page added**: identity card + Change Password dialog +
  per-user recent-activity timeline. Available to all signed-in users.
- **Activity API extended**: optional `from`/`to`/`user` query params with
  parameterised raw SQL (no injection risk). Bare `YYYY-MM-DD` dates
  normalised to start/end-of-day UTC. Backward-compatible.
- **Activity feed upgraded**: date-range filter + admin-only CSV export
  (reuses `@/lib/erp/csv`, exports up to 200 rows with current filter params).
  No new npm packages.
- **Files owned/edited (only these)**: `src/components/erp/change-password.tsx`,
  `src/components/erp/pages/profile.tsx` (NEW), `src/lib/erp/nav.ts`,
  `src/app/page.tsx`, `src/components/erp/user-menu.tsx`,
  `src/components/erp/activity-feed.tsx`, `src/app/api/activity/route.ts`,
  `src/lib/erp/activity.ts`.
- **Reusable helpers reused, not re-implemented**: `downloadCSV`/`toCSV`/`CsvColumn`
  from `@/lib/erp/csv`; `useApi` from `@/lib/erp/client`; `asRole`/`isAdmin`/
  `ROLE_LABEL` from `auth-shared`; `SectionCard`/`PageIntro`/`StatusBadge` from
  `shared.tsx`; `ChangePasswordDialog` imported into profile.tsx instead of
  duplicating. Did NOT create a new `src/lib/erp/activity-csv.ts` since
  `csv.ts` already covers the use case (the spec said "OR reuse existing").
