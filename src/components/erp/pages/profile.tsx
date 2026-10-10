"use client";
// My Profile page — available to ALL signed-in users (not admin-gated).
//
// Shows the signed-in user's identity (name, email, role badge, numeric id,
// account status, last login), exposes the Change Password dialog, and lists
// their own recent activity (filtered server-side via the `user` query param
// on /api/activity so we only pay for the rows we actually show) + their own
// login history (from /api/auth/login-events — most recent row is used for the
// "Last login" readout).
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  KeyRound, Mail, ShieldCheck, Hash, Activity as ActivityIcon,
  History, Loader2, CircleUser, Clock, LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro, SectionCard, StatusBadge } from "../shared";
import { ChangePasswordDialog } from "../change-password";
import { useApi } from "@/lib/erp/client";
import { asRole, ROLE_LABEL, type Role } from "@/lib/erp/auth-shared";
import type { ActivityLogRow } from "@/lib/erp/activity";
import type { LoginEventRow } from "@/lib/erp/users";

// ─────────────────────────────────────────────────────────────────────────────
// Role → badge colour (no indigo/blue).
// ─────────────────────────────────────────────────────────────────────────────
function roleBadgeClass(role: Role): string {
  if (role === "admin") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  if (role === "operator") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact activity timeline — same colour tones as activity-feed.tsx but a
// simpler single-line layout suited to the smaller profile card.
// ─────────────────────────────────────────────────────────────────────────────

type Tone = "emerald" | "amber" | "rose" | "sky" | "violet" | "neutral";

const MODULE_TONE: Record<string, Tone> = {
  items: "amber",
  bom: "violet",
  inventory: "sky",
  production: "emerald",
  purchase: "amber",
  sales: "emerald",
  quality: "rose",
  pdi: "violet",
  shopfloor: "sky",
  settings: "neutral",
  seed: "neutral",
};

const TONE_DOT: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  neutral: "bg-muted-foreground/60",
};

function relativeTime(ts: string, now: number): string {
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function ActivityRow({ row, now }: { row: ActivityLogRow; now: number }) {
  const tone = MODULE_TONE[row.module] ?? "neutral";
  const rel = relativeTime(row.ts, now);
  return (
    <li className="relative pl-5">
      <span
        className={`absolute left-0 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-background ${TONE_DOT[tone]}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug text-foreground flex-1 min-w-0 truncate">
          {row.title}
        </p>
        {rel && (
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap tabular-nums shrink-0 pt-0.5">
            {rel}
          </span>
        )}
      </div>
      {row.detail && (
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
          {row.detail}
        </p>
      )}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium uppercase tracking-wider">
          {row.module}
        </Badge>
        {row.refId && (
          <span className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
            {row.refId}
          </span>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Login-history helpers — timestamp formatting + user-agent truncation.
// ─────────────────────────────────────────────────────────────────────────────

/** Format an ISO timestamp as a compact en-IN date-time (e.g. "15 Oct 2026, 02:23 PM"). */
function formatLoginTs(ts: string): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return ts;
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Best-effort truncation of a User-Agent string for compact table display. */
function truncateUA(ua: string | null, max = 48): string | null {
  if (!ua) return null;
  const trimmed = ua.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

// ─────────────────────────────────────────────────────────────────────────────
// Page.
// ─────────────────────────────────────────────────────────────────────────────

function initials(name?: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "U";
}

function InfoRow({
  icon: Icon, label, value, mono,
}: {
  icon: typeof Mail;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-muted text-muted-foreground shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-sm text-foreground truncate ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [pwOpen, setPwOpen] = useState(false);

  const name = session?.user?.name ?? null;
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;
  const role: Role = asRole(session?.user?.role);

  // Server-side user filter — fetch only this user's events. The `user`
  // column stores the actor's email (or "system"), so this matches exactly.
  const activityKey = email
    ? `/api/activity?limit=10&user=${encodeURIComponent(email)}`
    : null;
  const { data, isLoading, isError } = useApi<ActivityLogRow[]>(
    activityKey ?? "/api/activity?limit=0",
    !!email,
  );
  const rows = useMemo(() => data ?? [], [data]);

  // Login history — most recent 10 events for the signed-in user. The first
  // row is used as the "Last login" readout in the identity card; the full
  // list populates the Login history section. The API auto-restricts non-admins
  // to their own events, so no `userId` query is required.
  const loginKey = userId ? `/api/auth/login-events?limit=10` : null;
  const {
    data: loginEvents,
    isLoading: loginLoading,
    isError: loginError,
  } = useApi<LoginEventRow[]>(loginKey ?? "/api/auth/login-events?limit=0", !!userId);
  const loginRows = useMemo(() => loginEvents ?? [], [loginEvents]);
  const lastLoginTs = loginRows.length > 0 ? loginRows[0].ts : null;

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!email) {
    // Defensive — layout.tsx gates the whole ERP behind auth, so this only
    // shows if the session is mid-refresh.
    return (
      <SectionCard bodyClassName="p-10">
        <div className="flex flex-col items-center text-center gap-2 py-8">
          <CircleUser className="h-8 w-8 text-muted-foreground/50" />
          <h2 className="text-base font-semibold">No signed-in user</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Sign in to view your profile.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <PageIntro actions={
        <Button onClick={() => setPwOpen(true)}>
          <KeyRound className="h-4 w-4 mr-1" />Change password
        </Button>
      }>
        Your ERP account profile — identity, role and recent activity. Update your sign-in
        password any time; administrators can also manage other users from the Users page.
      </PageIntro>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Identity card */}
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <CircleUser className="h-4 w-4" />Account
            </span>
          }
          subtitle="Your Tau Power ERP identity"
        >
          <div className="px-5 pt-3 pb-5">
            <div className="flex items-center gap-3 pb-4 border-b">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-sidebar text-sidebar-primary text-base font-semibold shrink-0">
                {initials(name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold truncate">{name ?? "Signed in"}</div>
                <div className="text-xs font-mono text-muted-foreground truncate">{email}</div>
              </div>
              <Badge className={`text-[10px] uppercase tracking-wider shrink-0 ${roleBadgeClass(role)}`}>
                {ROLE_LABEL[role]}
              </Badge>
            </div>
            <div className="mt-1">
              <InfoRow icon={Mail} label="Email" value={email} mono />
              <InfoRow icon={Hash} label="User id" value={userId || "—"} mono />
              <InfoRow
                icon={ShieldCheck}
                label="Role"
                value={
                  <span className="flex items-center gap-2">
                    {ROLE_LABEL[role]}
                    {role === "admin" && (
                      <span className="text-[11px] text-muted-foreground">· full administrative access</span>
                    )}
                    {role === "operator" && (
                      <span className="text-[11px] text-muted-foreground">· edit + dispatch access</span>
                    )}
                    {role === "viewer" && (
                      <span className="text-[11px] text-muted-foreground">· read-only access</span>
                    )}
                  </span>
                }
              />
              <InfoRow
                icon={Clock}
                label="Last login"
                value={
                  loginLoading && !lastLoginTs ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </span>
                  ) : lastLoginTs ? (
                    <span className="tabular-nums">{formatLoginTs(lastLoginTs)}</span>
                  ) : (
                    <span className="text-muted-foreground italic">First sign-in</span>
                  )
                }
              />
              <InfoRow
                icon={ActivityIcon}
                label="Account status"
                value={<StatusBadge status="ACTIVE" />}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setPwOpen(true)} variant="outline" size="sm">
                <KeyRound className="h-4 w-4 mr-1.5" />Change password
              </Button>
            </div>
          </div>
        </SectionCard>

        {/* Recent activity by me */}
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" />Recent activity by you
            </span>
          }
          subtitle={`Last ${rows.length === 0 ? "0" : rows.length} actions attributed to ${email}`}
          bodyClassName="px-5 py-3"
        >
          {isLoading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-2.5 w-2.5 rounded-full shrink-0 mt-1" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <History className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
              Could not load activity.
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <History className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
              No recent activity attributed to your account yet.
            </div>
          ) : (
            <ol className="relative ml-2 border-l border-border space-y-4 py-1">
              {rows.map((row) => (
                <ActivityRow key={row.id} row={row} now={Date.now()} />
              ))}
            </ol>
          )}
          <div className="border-t pt-2 mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <History className="h-3 w-3 opacity-50" />
            )}
            <span>{rows.length} {rows.length === 1 ? "event" : "events"} · open the Activity drawer for the full log</span>
          </div>
        </SectionCard>
      </div>

      {/* Login history — full-width below the two-column grid. Most recent
          first; the first row is also surfaced as "Last login" in the identity
          card above. Only the signed-in user's own events are visible here
          (the API auto-restricts non-admins to their own events). */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <LogIn className="h-4 w-4" />Login history
          </span>
        }
        subtitle={`Last ${loginRows.length === 0 ? "0" : loginRows.length} successful sign-ins attributed to ${email ?? "your account"}`}
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {loginLoading ? (
          <div className="px-5 py-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : loginError ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            <LogIn className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
            Could not load login history.
          </div>
        ) : loginRows.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            <LogIn className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
            No previous sign-ins recorded. This is your first sign-in.
          </div>
        ) : (
          <table className="zebra w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium px-5 py-2">When</th>
                <th className="text-left font-medium px-3">IP address</th>
                <th className="text-left font-medium px-3">User agent</th>
                <th className="text-right font-medium px-5">Result</th>
              </tr>
            </thead>
            <tbody>
              {loginRows.map((row) => {
                const ua = truncateUA(row.userAgent);
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-5 py-2 tabular-nums whitespace-nowrap">{formatLoginTs(row.ts)}</td>
                    <td className="px-3 font-mono text-xs text-muted-foreground tabular-nums">
                      {row.ip ?? <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="px-3 text-xs text-muted-foreground max-w-[28ch] truncate" title={row.userAgent ?? undefined}>
                      {ua ?? <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="px-5 text-right">
                      {row.success ? (
                        <Badge className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Success
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] uppercase tracking-wider bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                          Failed
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}
