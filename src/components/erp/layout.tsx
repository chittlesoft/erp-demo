"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Boxes, Cpu, LayoutGrid, ShieldCheck, Network, Warehouse, Factory,
  CalendarClock, ScanSearch, Moon, Sun, Menu, X, Users, ShoppingCart, Receipt, BookOpen,
  BarChart3, ArrowLeftRight,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/erp/client";
import type { Settings } from "@/lib/erp/shared";
import { useNav, type View } from "@/lib/erp/nav";
import { CommandPalette, CommandPaletteTrigger } from "./command-palette";
import { NotificationsBell } from "./notifications";
const NAV: { href: View; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "" },
  { href: "analytics", label: "Management Dashboards", icon: BarChart3, group: "" },
  { href: "items", label: "Items", icon: Boxes, group: "Manufacturing" },
  { href: "bom", label: "Bill of Materials", icon: Network, group: "Manufacturing" },
  { href: "production", label: "Production", icon: Factory, group: "Manufacturing" },
  { href: "shopfloor", label: "Shop Floor", icon: Cpu, group: "Manufacturing" },
  { href: "quality", label: "Quality", icon: ShieldCheck, group: "Manufacturing" },
  { href: "planning", label: "MRP Planning", icon: CalendarClock, group: "Manufacturing" },
  { href: "trace", label: "Traceability", icon: ScanSearch, group: "Manufacturing" },
  { href: "inventory", label: "Inventory", icon: Warehouse, group: "Supply chain" },
  { href: "warehouse", label: "Warehouse Bins", icon: LayoutGrid, group: "Supply chain" },
  { href: "purchase", label: "Purchase", icon: ShoppingCart, group: "Supply chain" },
  { href: "sales", label: "Sales & GST Invoices", icon: Receipt, group: "Supply chain" },
  { href: "jobwork", label: "Job Work", icon: ArrowLeftRight, group: "Supply chain" },
  { href: "parties", label: "Customers & Vendors", icon: Users, group: "Supply chain" },
  { href: "accounts", label: "Tally & Company", icon: BookOpen, group: "Accounts" },
];

const VIEW_TITLES: Record<View, string> = Object.fromEntries(NAV.map((n) => [n.href, n.label])) as Record<View, string>;

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-label="Tau Power ERP logo" className={className}>
      <path d="M10 5h12l3.5 5.5L22 16H10l-3.5-5.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 16v6h6v-6" stroke="currentColor" strokeWidth="2" />
      <path d="M16 22v6" stroke="hsl(var(--sidebar-primary))" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { view, go } = useNav();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const cfg = useApi<Settings>("/api/settings").data;

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [view]);

  const current = NAV.find((n) => n.href === view);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
          <Logo className="h-7 w-7 text-sidebar-primary" />
          <div className="leading-tight">
            <div className="font-semibold text-white text-sm tracking-tight">Tau Power ERP</div>
            <div className="text-[11px] text-sidebar-foreground/60">Hinjawadi plant · Phase 4</div>
          </div>
          <button className="ml-auto md:hidden text-sidebar-foreground" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scroll-thin">
          {NAV.map((n, i) => {
            const active = view === n.href;
            const prevGroup = NAV[i - 1]?.group;
            return (
              <div key={n.href}>
                {n.group && n.group !== prevGroup && (
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/45 font-medium">{n.group}</div>
                )}
                <button
                  onClick={() => go(n.href)}
                  className={`w-full flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-sidebar-accent text-white font-medium" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white"}`}
                >
                  <n.icon className={`h-4 w-4 ${active ? "text-sidebar-primary" : ""}`} />
                  {n.label}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/50 leading-relaxed">
          Coming next: user logins &amp; roles, HR, PostgreSQL, barcode scanners, test-bench integration
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden no-print" onClick={() => setOpen(false)} />}

      <div className="flex-1 md:pl-60 min-w-0 flex flex-col">
        <header className="no-print sticky top-0 z-20 h-14 flex items-center gap-3 px-4 md:px-6 border-b bg-background/90 backdrop-blur">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <h1 className="text-base font-semibold">{current?.label ?? "Tau Power ERP"}</h1>
          <div className="ml-auto flex items-center gap-2">
            {cfg && !cfg.gstin && (
              <button onClick={() => go("accounts")} className="text-[11px] rounded bg-accent text-accent-foreground px-2 py-1 font-medium">
                Company GSTIN missing
              </button>
            )}
            <CommandPaletteTrigger />
            <span className="hidden sm:inline text-xs text-muted-foreground">Prototype · demo transactions</span>
            <NotificationsBell />
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-[1500px] w-full mx-auto">{children}</main>
        <footer className="no-print mt-auto border-t bg-muted/30 px-4 md:px-6 py-3 text-center text-[11px] text-muted-foreground">
          Tau Power Electronics Pvt Ltd · IATF 16949 · Hinjawadi, Pune · GSTIN 27AAKCT4244J1Z0 — Prototype for review
        </footer>
      </div>
      <CommandPalette />
    </div>
  );
}

export { VIEW_TITLES };
