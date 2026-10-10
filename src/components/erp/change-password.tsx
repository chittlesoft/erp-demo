"use client";
// Change-password dialog — available to any authenticated user via the
// user-menu dropdown. POSTs to /api/auth/change-password which verifies the
// current password (sha256) + hashes the new one with the same scheme as
// `src/lib/erp/users.ts`. Toast on success/error; closes on success.
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, KeyRound } from "lucide-react";
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

  // Reset fields every time the dialog is opened so a stale typed-in value
  // never carries over from a previous attempt.
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setPending(false);
    }
  }, [open]);

  const mismatch = next && confirm && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_PW;
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
          <div className="space-y-1.5">
            <Label htmlFor="cp-current" className="text-xs">Current password</Label>
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-new" className="text-xs">New password</Label>
            <Input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              disabled={pending}
              aria-invalid={tooShort || undefined}
            />
            {tooShort && (
              <p className="text-[11px] text-destructive">
                Password must be at least {MIN_PW} characters.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm" className="text-xs">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={pending}
              aria-invalid={mismatch || undefined}
            />
            {mismatch && (
              <p className="text-[11px] text-destructive">New passwords do not match.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
