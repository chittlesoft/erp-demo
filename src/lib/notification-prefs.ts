// Notification preferences — types, defaults, and a server-backed reactive hook.
//
// Originally (round 12-b) these prefs lived in client-side localStorage. Round
// 13-b migrates them to the server so they follow the user across devices and
// sessions: the source of truth is the `notification_prefs` SQLite table (one
// row per user), surfaced via GET/PATCH `/api/notifications/preferences`. The
// `useNotificationPrefs` hook now wraps `useApi` so any component reading
// prefs — the bell popover, the preferences dialog — re-renders automatically
// when a PATCH invalidates the query.
//
// The hook returns `{ prefs, isLoading }` where `prefs` falls back to
// `DEFAULT_PREFS` while the GET is in flight, so the bell always renders with
// sensible defaults during the first paint after sign-in.
//
// NOTE: this file is deliberately NOT marked `"use client"` — it is imported
// by the server-side `notification-prefs-server.ts` (for `DEFAULT_PREFS`) AND
// by client components (for `useNotificationPrefs`). A `"use client"` directive
// would replace the `DEFAULT_PREFS` value with a client-reference proxy on the
// server, breaking `getPrefs()`. Marking a file `"use client"` only matters
// for entry-point client modules; `useApi` (imported below from
// `@/lib/erp/client`, which IS `"use client"`) carries the client boundary.

import { useApi } from "@/lib/erp/client";

/** The six notification toggles surfaced in the preferences dialog. */
export type NotificationPrefs = {
  /** Invoices awaiting IRN */
  irnPending: boolean;
  /** Open NCRs (non-conformance reports) */
  openNcrs: boolean;
  /** Stock lines awaiting put-away to a bin */
  putAway: boolean;
  /** PPAP submissions pending */
  ppapPending: boolean;
  /** Open purchase indents */
  openIndents: boolean;
  /** Daily digest email (UI toggle only — no email is actually sent) */
  dailyDigest: boolean;
};

/** Sensible defaults — every actionable alert enabled, digest off. */
export const DEFAULT_PREFS: NotificationPrefs = {
  irnPending: true,
  openNcrs: true,
  putAway: true,
  ppapPending: true,
  openIndents: true,
  dailyDigest: false,
};

/**
 * Reactive hook for notification prefs. Server-backed via
 * `GET /api/notifications/preferences`. Returns `DEFAULT_PREFS` while the
 * fetch is in flight so consumers (bell popover, preferences dialog) can
 * render with sensible defaults before the first response arrives. Mutations
 * happen through `useAction("PATCH", …)` (see `notification-preferences.tsx`);
 * on success the TanStack Query cache is invalidated, which causes every
 * component using this hook to refetch + re-render.
 *
 * Components using this MUST be client components (`"use client"` at the top).
 */
export function useNotificationPrefs(): {
  prefs: NotificationPrefs;
  isLoading: boolean;
} {
  const { data, isLoading } = useApi<NotificationPrefs>(
    "/api/notifications/preferences",
  );
  return {
    prefs: data ?? DEFAULT_PREFS,
    isLoading,
  };
}
