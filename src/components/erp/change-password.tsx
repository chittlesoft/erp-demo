"use client";
// Change-password dialog — available to any authenticated user via the
// user-menu dropdown. POSTs to /api/auth/change-password which verifies the
// current password (sha256) + hashes the new one with the same scheme as
// `src/lib/erp/users.ts`. Toast on success/error; closes on success.
//
// UX (round 11-a polish):
//   - Eye toggle per field — show/hide each password independently.
//   - Strength meter on the new-password field (4-segment bar + label).
//   - Clearer disabled state — Save stays visibly disabled (opacity-50 +
//     cursor-not-allowed via shadcn) until all 3 fields are filled AND the
//     new password meets the minimum length AND new === confirm. Inline
//     hints below each field explain what's missing.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const MIN_PW = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Password strength meter — 4-segment bar + label.
//
// Score (0..4):
//   length ≥ 8           → +1
//   has lowercase        → +1
//   has digit            → +1
//   has uppercase OR     → +1
//   symbol
//
// Mapping:
//   0 → muted, "—" (empty / no input)
//   1 → rose,  "Weak"
//   2 → amber, "Fair"
//   3 → sky,   "Good"
//   4 → emerald, "Strong"
// ─────────────────────────────────────────────────────────────────────────────

function computeStrength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[A-Z]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

type StrengthMeta = { label: string; bar: string; text: string };

const STRENGTH_META: StrengthMeta[] = [
  { label: "—",      bar: "bg-muted",                     text: "text-muted-foreground/60" },
  { label: "Weak",   bar: "bg-rose-500",                  text: "text-rose-600 dark:text-rose-400" },
  { label: "Weak",   bar: "bg-rose-500",                  text: "text-rose-600 dark:text-rose-400" },
  { label: "Fair",   bar: "bg-amber-500",                 text: "text-amber-600 dark:text-amber-400" },
  { label: "Good",   bar: "bg-sky-500",                   text: "text-sky-600 dark:text-sky-400" },
  { label: "Strong", bar: "bg-emerald-500",               text: "text-emerald-600 dark:text-emerald-400" },
];

function StrengthMeter({ pw }: { pw: string }) {
  const s = computeStrength(pw);
  const meta = STRENGTH_META[s];
  return (
    <div className="flex items-center gap-2 mt-1.5" aria-live="polite">
      <div className="flex gap-1 flex-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < s ? meta.bar : "bg-muted"}`}
          />
        ))}
      </div>
      <span className={`text-[11px] tabular-nums w-14 text-right ${meta.text}`}>
        {meta.label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable password field with eye toggle + hint slot.
// ─────────────────────────────────────────────────────────────────────────────

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggleShow,
  disabled,
  autoFocus,
  invalid,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          className="pr-9"
        />
        <button
          type="button"
          onClick={onToggleShow}
          disabled={disabled}
          className="absolute right-0.5 top-0.5 bottom-0.5 px-2 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog.
// ─────────────────────────────────────────────────────────────────────────────

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  // Per-field visibility toggles — independent of each other so a user can
  // confirm what they typed into the new/confirm fields without revealing
  // their current password, or vice-versa.
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset fields every time the dialog is opened so a stale typed-in value
  // never carries over from a previous attempt.
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setPending(false);
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
    }
  }, [open]);

  // Validation state.
  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_PW;
  const currentMissing = current.length === 0;
  const nextEmpty = next.length === 0;
  const confirmEmpty = confirm.length === 0;
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_PW &&
    confirm.length > 0 &&
    next === confirm &&
    !pending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!canSubmit) {
      if (tooShort) {
        toast({ title: `Password must be at least ${MIN_PW} characters`, variant: "destructive" });
      } else if (mismatch) {
        toast({ title: "New passwords do not match", variant: "destructive" });
      } else {
        toast({ title: "Fill in all three fields", variant: "destructive" });
      }
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const text = await res.text();
      let msg = text;
      try {
        msg = JSON.parse(text).message ?? text;
      } catch {
        /* keep raw text */
      }
      if (!res.ok) {
        throw new Error(msg || "Failed to change password");
      }
      toast({ title: "Password changed", description: "Use the new password next time you sign in." });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Could not change password",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Change password
          </DialogTitle>
          <DialogDescription>
            Choose a new password for your ERP account. Minimum {MIN_PW} characters.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <PasswordField
            id="cp-current"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
            disabled={pending}
            autoFocus
          />
          <PasswordField
            id="cp-new"
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            disabled={pending}
            invalid={tooShort || undefined}
            hint={
              <>
                <StrengthMeter pw={next} />
                {tooShort ? (
                  <p className="text-[11px] text-destructive mt-1">
                    Password must be at least {MIN_PW} characters.
                  </p>
                ) : next.length > 0 && next.length < 8 ? (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Tip: use 8+ characters with a mix of letters, digits and symbols for a stronger password.
                  </p>
                ) : null}
              </>
            }
          />
          <PasswordField
            id="cp-confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            show={showConfirm}
            onToggleShow={() => setShowConfirm((v) => !v)}
            disabled={pending}
            invalid={mismatch || undefined}
            hint={
              mismatch ? (
                <p className="text-[11px] text-destructive">New passwords do not match.</p>
              ) : null
            }
          />
          <DialogFooter className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className={canSubmit ? "" : "opacity-60 cursor-not-allowed"}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </DialogFooter>
          {/* Inline summary hint above the footer when the button is disabled —
              gives the user a single-glance reason why Save is greyed out. */}
          {!canSubmit && !pending && (
            <p className="text-[11px] text-muted-foreground text-center -mt-1" aria-live="polite">
              {currentMissing || nextEmpty || confirmEmpty
                ? "Fill in all three fields to enable Save."
                : tooShort
                  ? `New password must be at least ${MIN_PW} characters.`
                  : mismatch
                    ? "New passwords do not match."
                    : ""}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
