"use client";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Loader2, LogIn, ShieldCheck, UserCircle2, Wrench, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/erp/layout";
import { ROLE_LABEL, type Role } from "@/lib/erp/auth-shared";

type DemoAccount = { email: string; password: string; role: Role; name: string; icon: typeof ShieldCheck };

const DEMO: DemoAccount[] = [
  { email: "admin@taupower.in",    password: "admin123",    role: "admin",    name: "Plant Admin",       icon: ShieldCheck },
  { email: "operator@taupower.in", password: "operator123", role: "operator", name: "Shop Operator",     icon: Wrench },
  { email: "viewer@taupower.in",   password: "viewer123",   role: "viewer",   name: "Read-only Viewer",   icon: Eye },
];

export function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  function fill(a: DemoAccount) {
    setEmail(a.email);
    setPassword(a.password);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!email.trim() || !password) {
      toast({ title: "Enter your email and password", variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        toast({ title: "Sign-in failed", description: "Invalid email or password.", variant: "destructive" });
      } else {
        toast({ title: "Signed in", description: "Loading the ERP workspace…" });
        // Hard refresh so the Layout gate re-evaluates the session cookie.
        window.location.reload();
      }
    } catch (err) {
      toast({ title: "Sign-in failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-sidebar flex items-center justify-center text-sidebar-primary shadow-sm">
            <Logo className="h-8 w-8" />
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Tau Power ERP</h1>
          <p className="text-xs text-muted-foreground">Hinjawadi plant · Phase 4 — sign in to continue</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>Use your ERP credentials or pick a demo account below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@taupower.in"
                  required
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={pending}
                />
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                Demo credentials — click to fill
              </div>
              <div className="space-y-2">
                {DEMO.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => fill(a)}
                    disabled={pending}
                    className="w-full flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-sidebar text-sidebar-primary">
                      <a.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 leading-tight">
                      <span className="block font-medium">{a.name}</span>
                      <span className="block text-[11px] text-muted-foreground font-mono">{a.email}</span>
                    </span>
                    <span className="text-right leading-tight">
                      <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[a.role]}</span>
                      <span className="block text-[11px] text-muted-foreground font-mono">{a.password}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          <UserCircle2 className="inline h-3 w-3 mr-1 align-text-bottom" />
          Prototype authentication — credentials stored in SQLite. Server-side API gating is a future round.
        </p>
      </div>
    </div>
  );
}
