"use client";
// Client-side notification preferences (stored in localStorage).
//
// Why client-only? Persisting per-user notification preferences on the server
// would require a new Prisma model (e.g. NotificationPref keyed by userId) —
// which is owned by the parallel auth/profile agent (12-a) and out of scope for
// this task. For the prototype we keep the toggle state in localStorage so the
// bell badge + popover filter immediately reflect the user's choices without a
// schema migration or extra API round-trip.

import { useCallback, useSyncExternalStore } from "react";

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

const STORAGE_KEY = "taupower.notif-prefs";

/** Merge stored prefs with defaults so newly-added toggles always have a value. */
function normalize(raw: Partial<NotificationPrefs> | null): NotificationPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...raw };
}

/** Read prefs from localStorage (SSR-safe — returns defaults on the server). */
export function loadPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return normalize(JSON.parse(raw) as Partial<NotificationPrefs>);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Persist prefs to localStorage. Silently ignores SSR + quota errors. */
export function savePrefs(prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// `useSyncExternalStore` is the React-blessed way to subscribe to an external
// store (localStorage) without triggering the `react-hooks/set-state-in-effect`
// lint rule or causing hydration mismatches.

let prefsCache: NotificationPrefs | null = null;
let rawCache: string | null = null;
const listeners = new Set<() => void>();

function readRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getSnapshot(): NotificationPrefs {
  const raw = readRaw();
  // Memoize the parsed prefs against the raw string so the same snapshot value
  // is returned across renders when localStorage hasn't changed (otherwise
  // useSyncExternalStore can loop on referentially-different equal objects).
  if (raw !== rawCache || prefsCache === null) {
    rawCache = raw;
    prefsCache = raw ? normalize(JSON.parse(raw) as Partial<NotificationPrefs>) : { ...DEFAULT_PREFS };
  }
  return prefsCache;
}

function getServerSnapshot(): NotificationPrefs {
  return DEFAULT_PREFS;
}

function notify(): void {
  // Invalidate the parsed cache so the next getSnapshot() reflects the new value.
  rawCache = null;
  prefsCache = null;
  for (const l of listeners) l();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

/**
 * Reactive hook for notification prefs. Loads on mount, persists on change,
 * and re-renders every component using this hook when prefs change anywhere.
 * Components using this MUST be client components (`"use client"` at the top).
 */
export function useNotificationPrefs(): {
  prefs: NotificationPrefs;
  setPref: (key: keyof NotificationPrefs, value: boolean) => void;
  reset: () => void;
} {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPref = useCallback((key: keyof NotificationPrefs, value: boolean) => {
    const next: NotificationPrefs = { ...getSnapshot(), [key]: value };
    savePrefs(next);
    notify();
  }, []);

  const reset = useCallback(() => {
    savePrefs({ ...DEFAULT_PREFS });
    notify();
  }, []);

  return { prefs, setPref, reset };
}

