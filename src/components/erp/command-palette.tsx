"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Boxes, Cpu, LayoutGrid, ShieldCheck, Network, Warehouse, Factory,
  CalendarClock, ScanSearch, Users, ShoppingCart, Receipt, BookOpen, BarChart3,
  ArrowLeftRight, RefreshCw, Moon, Sun, History,
} from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup,
  CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { useNav, type View } from "@/lib/erp/nav";
import { useToast } from "@/hooks/use-toast";
import { openActivityDrawer } from "./activity-feed";

// Local copy of the sidebar nav list (icons + labels) so the palette stays
// self-contained without needing layout.tsx to export its private NAV array.
const NAV_ITEMS: { href: View; label: string; icon: typeof LayoutDashboard }[] = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "analytics", label: "Management Dashboards", icon: BarChart3 },
  { href: "items", label: "Items", icon: Boxes },
  { href: "bom", label: "Bill of Materials", icon: Network },
  { href: "production", label: "Production", icon: Factory },
  { href: "shopfloor", label: "Shop Floor", icon: Cpu },
  { href: "quality", label: "Quality", icon: ShieldCheck },
  { href: "planning", label: "MRP Planning", icon: CalendarClock },
  { href: "trace", label: "Traceability", icon: ScanSearch },
  { href: "inventory", label: "Inventory", icon: Warehouse },
  { href: "warehouse", label: "Warehouse Bins", icon: LayoutGrid },
  { href: "purchase", label: "Purchase", icon: ShoppingCart },
  { href: "sales", label: "Sales & GST Invoices", icon: Receipt },
  { href: "jobwork", label: "Job Work", icon: ArrowLeftRight },
  { href: "parties", label: "Customers & Vendors", icon: Users },
  { href: "accounts", label: "Tally & Company", icon: BookOpen },
];

// Module-level event name so an external trigger button can open the palette.
const OPEN_EVENT = "tau:command-palette:open";
export function openCommandPalette(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Global Cmd/Ctrl+K command palette: quick navigation + demo actions. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { go } = useNav();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Open on Cmd/Ctrl+K, or when an external `openCommandPalette()` fires.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const navigate = (view: View) => {
    go(view);
    setOpen(false);
  };

  const reloadDemo = async () => {
    setOpen(false);
    toast({ title: "Reloading demo data…", description: "Re-seeding the SQLite database" });
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      qc.invalidateQueries();
      toast({ title: "Demo data reloaded", description: "All ERP views refreshed" });
    } catch (e) {
      toast({
        title: "Reload failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
    setOpen(false);
  };

  const viewActivity = () => {
    setOpen(false);
    openActivityDrawer();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="max-w-xl">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matches found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((n) => (
            <CommandItem
              key={n.href}
              value={`go ${n.label} ${n.href} navigate`}
              onSelect={() => navigate(n.href)}
            >
              <n.icon className="h-4 w-4 text-muted-foreground" />
              <span>{n.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="reload demo data reseed reset"
            onSelect={() => void reloadDemo()}
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <span>Reload demo data</span>
          </CommandItem>
          <CommandItem
            value="activity log timeline history audit events"
            onSelect={viewActivity}
          >
            <History className="h-4 w-4 text-muted-foreground" />
            <span>View activity log</span>
          </CommandItem>
          <CommandItem value="toggle theme dark light mode" onSelect={toggleTheme}>
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Moon className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Toggle theme</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Visible "⌘K Search…" chip for the header — opens the palette on click. */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => openCommandPalette()}
      className="hidden md:inline-flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      aria-label="Open command palette (Ctrl+K)"
    >
      <span className="font-mono">⌘K</span>
      <span>Search…</span>
    </button>
  );
}
