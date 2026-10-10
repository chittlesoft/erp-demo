"use client";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { ChevronsUpDown, KeyRound, Loader2, LogOut, RefreshCw, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ROLE_LABEL, asRole, isAdmin, type Role } from "@/lib/erp/auth-shared";
import { ChangePasswordDialog } from "./change-password";

function initials(name?: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "U";
}

/** Header dropdown with the signed-in user's identity + admin-only actions. */
export function UserMenu() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [reseeding, setReseeding] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const name = session?.user?.name ?? null;
  const email = session?.user?.email ?? null;
  const role: Role = asRole(session?.user?.role);
  const admin = isAdmin(role);

  async function reloadDemoData() {
    if (reseeding) return;
    setReseeding(true);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const text = await res.text();
      if (!res.ok) {
        const msg = (() => { try { return JSON.parse(text).message ?? text; } catch { return text; } })();
        throw new Error(msg);
      }
      toast({ title: "Demo data reloaded", description: "All demo transactions were reseeded." });
    } catch (e) {
      toast({ title: "Reload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setReseeding(false);
    }
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2 h-9" aria-label="User menu">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-sidebar text-sidebar-primary text-[11px] font-semibold">
            {initials(name)}
          </span>
          <span className="hidden lg:flex flex-col items-start leading-none">
            <span className="text-xs font-medium">{name ?? "Signed in"}</span>
            <span className="text-[10px] text-muted-foreground">{ROLE_LABEL[role]}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-sidebar text-sidebar-primary text-xs font-semibold">
            {initials(name)}
          </span>
          <span className="flex-1 leading-tight">
            <span className="block text-sm font-medium">{name ?? "Signed in"}</span>
            <span className="block text-[11px] text-muted-foreground font-mono">{email ?? ""}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Role</span>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{ROLE_LABEL[role]}</Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setPwOpen(true); }}
          className="cursor-pointer"
        >
          <KeyRound className="h-4 w-4" />
          <span>Change password</span>
        </DropdownMenuItem>
        {admin && (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); reloadDemoData(); }}
            disabled={reseeding}
            className="cursor-pointer"
          >
            {reseeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{reseeding ? "Reloading…" : "Reload demo data"}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); signOut({ callbackUrl: "/" }); }}
          variant="destructive"
          className="cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <UserCircle2 className="h-3 w-3" />
          <span>{admin ? "Administrator access" : role === "operator" ? "Edit + dispatch access" : "Read-only access"}</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}
