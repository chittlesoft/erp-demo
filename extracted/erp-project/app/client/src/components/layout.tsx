import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Boxes, Cpu, LayoutGrid, ShieldCheck, Network, Warehouse, Factory, CalendarClock, ScanSearch, Moon, Sun, Menu, X, Users, ShoppingCart, Receipt, BookOpen, BarChart3, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/erp";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "" },
  { href: "/analytics", label: "Management Dashboards", icon: BarChart3, group: "" },
  { href: "/items", label: "Items", icon: Boxes, group: "Manufacturing" },
  { href: "/bom", label: "Bill of Materials", icon: Network, group: "Manufacturing" },
  { href: "/production", label: "Production", icon: Factory, group: "Manufacturing" },
  { href: "/shopfloor", label: "Shop Floor", icon: Cpu, group: "Manufacturing" },
  { href: "/quality", label: "Quality", icon: ShieldCheck, group: "Manufacturing" },
  { href: "/planning", label: "MRP Planning", icon: CalendarClock, group: "Manufacturing" },
  { href: "/trace", label: "Traceability", icon: ScanSearch, group: "Manufacturing" },
  { href: "/inventory", label: "Inventory", icon: Warehouse, group: "Supply chain" },
  { href: "/warehouse", label: "Warehouse Bins", icon: LayoutGrid, group: "Supply chain" },
  { href: "/purchase", label: "Purchase", icon: ShoppingCart, group: "Supply chain" },
  { href: "/sales", label: "Sales & GST Invoices", icon: Receipt, group: "Supply chain" },
  { href: "/jobwork", label: "Job Work", icon: ArrowLeftRight, group: "Supply chain" },
  { href: "/parties", label: "Customers & Vendors", icon: Users, group: "Supply chain" },
  { href: "/accounts", label: "Tally & Company", icon: BookOpen, group: "Accounts" },
];

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
  const [loc] = useLocation();
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [open, setOpen] = useState(false);
  const cfg = useSettings().data;
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => setOpen(false), [loc]);
  const current = NAV.find(n => (n.href === "/" ? loc === "/" : loc.startsWith(n.href))) ?? (loc.startsWith("/invoice") || loc.startsWith("/note") ? NAV.find(n => n.href === "/sales") : loc.startsWith("/challan") || loc.startsWith("/jw-invoice") ? NAV.find(n => n.href === "/jobwork") : loc.startsWith("/pdi") ? NAV.find(n => n.href === "/quality") : undefined);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className={`print:hidden fixed inset-y-0 left-0 z-40 w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
          <Logo className="h-7 w-7 text-white" />
          <div className="leading-tight">
            <div className="font-semibold text-white text-sm tracking-tight">Tau Power ERP</div>
            <div className="text-[11px] text-sidebar-foreground/60">Hinjawadi plant · Phase 4</div>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((n, i) => {
            const active = current?.href === n.href;
            return (<div key={n.href}>
              {n.group && n.group !== NAV[i - 1]?.group && <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/45 font-medium">{n.group}</div>}
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-sidebar-accent text-white font-medium" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white"}`}>
                <n.icon className={`h-4 w-4 ${active ? "text-sidebar-primary" : ""}`} />{n.label}
              </Link></div>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/50 leading-relaxed">
          Coming next: user logins & roles, HR, PostgreSQL, barcode scanners, test-bench integration
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 md:pl-60 print:pl-0 min-w-0">
        <header className="print:hidden sticky top-0 z-20 h-14 flex items-center gap-3 px-4 md:px-6 border-b bg-background/90 backdrop-blur">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu" data-testid="button-open-menu"><Menu className="h-5 w-5" /></button>
          <h1 className="text-base font-semibold" data-testid="text-page-title">{current?.label ?? "Tau Power ERP"}</h1>
          <div className="ml-auto flex items-center gap-2">
            {cfg && !cfg.gstin && <Link href="/accounts" className="text-[11px] rounded bg-accent text-accent-foreground px-2 py-1 font-medium" data-testid="link-gstin-missing">Company GSTIN missing</Link>}
            <span className="hidden sm:inline text-xs text-muted-foreground">Prototype · demo transactions</span>
            <Button variant="ghost" size="icon" onClick={() => setDark(d => !d)} aria-label="Toggle theme" data-testid="button-theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <main className="p-4 md:p-6 print:p-0 max-w-[1400px]">{children}</main>
      </div>
    </div>
  );
}

export function PageIntro({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
      <p className="text-sm text-muted-foreground max-w-2xl">{children}</p>
      {actions && <div className="sm:ml-auto flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PLANNED: "bg-secondary text-secondary-foreground",
    OPEN: "bg-secondary text-secondary-foreground",
    PARTIAL: "bg-accent text-accent-foreground",
    CLOSED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    IRN_PENDING: "bg-accent text-accent-foreground",
    IRN_OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    IN_PROGRESS: "bg-accent text-accent-foreground",
    COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    ACCEPT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    REJECT: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    PASS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    FAIL: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    QUEUED: "bg-secondary text-secondary-foreground",
    HOLD: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    SCRAP: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    REWORK: "bg-accent text-accent-foreground",
    ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    INTERIM: "bg-accent text-accent-foreground",
    SUBMITTED: "bg-accent text-accent-foreground",
    PENDING: "bg-secondary text-secondary-foreground",
    ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    CNL: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    OVERDUE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    EWB_OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    EWB_PENDING: "bg-accent text-accent-foreground",
    NOT_REQUIRED: "bg-secondary text-secondary-foreground",
    ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    CRN: "bg-secondary text-secondary-foreground",
    DBN: "bg-accent text-accent-foreground",
  };
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${map[status] ?? "bg-muted"}`} data-testid={`status-${status}`}>{({ IRN_PENDING: "IRN pending", IRN_OK: "IRN generated", CNL: "IRN cancelled", EWB_OK: "EWB generated", EWB_PENDING: "EWB required", NOT_REQUIRED: "EWB not required", CRN: "Credit note", DBN: "Debit note" } as Record<string, string>)[status] ?? status.replace("_", " ")}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
