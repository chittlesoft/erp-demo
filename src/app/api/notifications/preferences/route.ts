// Per-user notification preferences API.
//
//   GET   /api/notifications/preferences  → returns the signed-in user's prefs
//   PATCH /api/notifications/preferences  → merge-update + return the saved prefs
//
// Both routes are session-gated via `requireAuth` (401 when no session). Prefs
// are persisted to the `notification_prefs` SQLite table by `savePrefs()` in
// `src/lib/erp/notification-prefs-server.ts`. A successful PATCH logs an
// `activity_logs` entry attributed to the signed-in user.

import { api, body, requireAuth } from "@/lib/erp/api";
import { getPrefs, savePrefs } from "@/lib/erp/notification-prefs-server";
import { DEFAULT_PREFS, type NotificationPrefs } from "@/lib/notification-prefs";
import { logActivityBy } from "@/lib/erp/activity";

export const GET = api(async (req) => {
  const session = await requireAuth(req);
  return getPrefs(Number(session.user.id));
});

export const PATCH = api(async (req) => {
  const session = await requireAuth(req);
  const patch = await body<Partial<NotificationPrefs>>(req);

  // Merge: defaults ← current (server) ← incoming patch. The defaults layer
  // future-proofs against newly-added toggles; the current layer preserves any
  // toggles the client didn't send; the patch layer applies the user's change.
  const current = await getPrefs(Number(session.user.id));
  const merged: NotificationPrefs = { ...DEFAULT_PREFS, ...current, ...patch };

  await savePrefs(Number(session.user.id), merged);

  // Fire-and-forget audit-trail entry (mirrors the settings/update pattern).
  void logActivityBy(session, {
    module: "settings",
    action: "update",
    refType: "user",
    refId: session.user.email,
    title: "Notification preferences updated",
  });

  return merged;
});
