"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Pencil, Trash2, UserCog, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, useAction } from "@/lib/erp/client";
import { asRole, isAdmin, ROLE_LABEL, type Role } from "@/lib/erp/auth-shared";
import { PageIntro, Empty, SectionCard, StatusBadge } from "../shared";

// User shape returned by /api/users (no password hash).
type UserRow = {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

const ROLES: Role[] = ["admin", "operator", "viewer"];

function roleBadgeClass(role: Role): string {
  if (role === "admin") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  if (role === "operator") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const role = asRole(session?.user?.role);
  const admin = isAdmin(role);
  const { data, isLoading } = useApi<UserRow[]>("/api/users", admin);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  if (status === "loading") {
    return <Skeleton className="h-64" />;
  }

  if (!admin) {
    return (
      <SectionCard bodyClassName="p-10">
        <div className="flex flex-col items-center text-center gap-2 py-8">
          <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-semibold">Administrator access required</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            User management is restricted to administrators. Your current role is{" "}
            <strong>{ROLE_LABEL[role]}</strong>. If you believe you should have access, contact your
            plant administrator.
          </p>
        </div>
      </SectionCard>
    );
  }

  const rows = data ?? [];

  return (
    <>
      <PageIntro actions={
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />New user
        </Button>
      }>
        ERP user accounts — sign-in credentials, role assignment and active status. Admins manage
        operators and viewers; disabling a user revokes sign-in without losing their activity history.
      </PageIntro>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />Users
          </span>
        }
        subtitle={`${rows.length} account${rows.length === 1 ? "" : "s"} on file`}
        bodyClassName="overflow-x-auto scroll-thin"
      >
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : rows.length === 0 ? (
          <Empty>No users found</Empty>
        ) : (
          <table className="zebra w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="font-medium px-5 py-2 text-left">Name</th>
                <th className="font-medium px-5 py-2 text-left">Email</th>
                <th className="font-medium px-5 py-2 text-left">Role</th>
                <th className="font-medium px-5 py-2 text-left">Status</th>
                <th className="font-medium px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.email === session?.user?.email;
                return (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-5 py-2">
                      <span className="font-medium">{u.name}</span>
                      {isSelf && <span className="ml-2 text-[11px] text-muted-foreground">(you)</span>}
                    </td>
                    <td className="px-5 py-2 font-mono text-xs">{u.email}</td>
                    <td className="px-5 py-2">
                      <Badge className={`text-[10px] uppercase tracking-wider ${roleBadgeClass(u.role)}`}>
                        {ROLE_LABEL[u.role]}
                      </Badge>
                    </td>
                    <td className="px-5 py-2">
                      <StatusBadge status={u.active ? "ACTIVE" : "CANCELLED"} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(u)}
                          aria-label={`Edit ${u.email}`}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(u)}
                          aria-label={`Delete ${u.email}`}
                          title="Delete"
                          disabled={isSelf}
                          className={isSelf ? "opacity-40" : ""}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      <UserDialog
        open={creating}
        onOpenChange={setCreating}
        user={null}
      />
      <UserDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        user={editing}
      />
      <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

// ============================== Create / Edit dialog ==============================
// `UserDialog` is a thin wrapper that mounts `UserForm` with a `key` derived from
// the target user id — this forces a fresh form each time the dialog opens on a
// different user, so the form state is initialised from `user` via `useState`
// (no `useEffect` sync needed).
function UserDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: UserRow | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* `key` ensures a fresh mount whenever the target user changes so the
            useState initialisers below pick up the new `user` prop. */}
        {open && (
          <UserForm key={user?.id ?? "new"} user={user} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserForm({ user, onDone }: { user: UserRow | null; onDone: () => void }) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "viewer");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.active ?? true);

  const create = useAction("POST", "/api/users", "User created");
  const update = useAction("PATCH", (b: { id: number; name: string; role: string; active: boolean; password?: string }) => `/api/users/${b.id}`, "User updated");

  const canSubmit = isEdit
    ? name.trim().length > 0 && (password === "" || password.length >= 6)
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && name.trim().length > 0 && password.length >= 6;

  const submit = () => {
    if (isEdit && user) {
      const payload: { id: number; name: string; role: string; active: boolean; password?: string } = {
        id: user.id,
        name: name.trim(),
        role,
        active,
      };
      if (password && password.length > 0) payload.password = password;
      update.mutate(payload, { onSuccess: onDone });
    } else {
      create.mutate(
        { email: email.trim().toLowerCase(), name: name.trim(), role, password, active },
        { onSuccess: onDone },
      );
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${user!.email}` : "New user"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update name, role or active status. Leave the password blank to keep the current one."
            : "Create a sign-in account and assign a role. Passwords are stored as a sha256 hash."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            className="mt-1 font-mono"
            type="email"
            value={email}
            disabled={isEdit}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@taupower.in"
          />
          {isEdit && (
            <p className="text-[11px] text-muted-foreground mt-1">Email cannot be changed.</p>
          )}
        </div>
        <div>
          <Label className="text-xs">Display name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  <span className="flex items-center gap-2">
                    {r === "admin" && <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />}
                    {ROLE_LABEL[r]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Password {isEdit && <span className="text-muted-foreground">(leave blank to keep current)</span>}</Label>
          <Input
            className="mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEdit ? "••••••" : "Min 6 characters"}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Active</div>
            <div className="text-[11px] text-muted-foreground">Inactive users cannot sign in.</div>
          </div>
          <Switch checked={active} onCheckedChange={setActive} aria-label="Active" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button
          onClick={submit}
          disabled={!canSubmit || create.isPending || update.isPending}
        >
          {isEdit ? "Save changes" : "Create user"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================== Delete confirmation ==============================
function DeleteUserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const del = useAction("DELETE", (b: { id: number }) => `/api/users/${b.id}`, "User deleted");
  if (!user) return null;
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user {user.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the account. Consider disabling instead — toggling active
            off revokes sign-in while preserving the user record. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => del.mutate({ id: user.id }, { onSuccess: () => onClose() })}
            disabled={del.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
