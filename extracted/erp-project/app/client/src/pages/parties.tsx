import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { STATES, GSTIN_RE } from "@shared/schema";
import { useParties, useSettings, useAction } from "@/lib/erp";
import { PageIntro, Empty } from "@/components/layout";

const ROLE_LABEL: Record<string, string> = { CUSTOMER: "Customer (OEM / Tier-1)", VENDOR: "Vendor", JOBWORKER: "Job worker" };

function PartyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const blank = { code: "", name: "", role: "CUSTOMER", gstin: "", stateCode: "", address: "", city: "", pincode: "", distanceKm: "0" };
  const [f, setF] = useState(blank);
  const save = useAction("POST", "/api/parties", "Party created");
  const gstOk = !f.gstin || GSTIN_RE.test(f.gstin);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === "gstin" || k === "code" ? e.target.value.toUpperCase() : e.target.value;
    setF(s => ({ ...s, [k]: v, ...(k === "gstin" && STATES[v.slice(0, 2)] ? { stateCode: v.slice(0, 2) } : {}) }));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New party</DialogTitle></DialogHeader>
        <form className="grid grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); save.mutate({ ...f, distanceKm: +f.distanceKm }, { onSuccess: () => { onOpenChange(false); setF(blank); } }); }}>
          <div className="space-y-1"><Label>Code</Label><Input value={f.code} onChange={set("code")} placeholder="C-XYZ" data-testid="input-party-code" /></div>
          <div className="space-y-1"><Label>Role</Label>
            <Select value={f.role} onValueChange={v => setF({ ...f, role: v })}><SelectTrigger data-testid="select-party-role"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2 space-y-1"><Label>Legal name</Label><Input value={f.name} onChange={set("name")} data-testid="input-party-name" /></div>
          <div className="space-y-1"><Label>GSTIN</Label><Input className="font-mono" maxLength={15} value={f.gstin} onChange={set("gstin")} data-testid="input-party-gstin" />{!gstOk && <p className="text-xs text-destructive">Format: 27ABCDE1234F1Z5</p>}</div>
          <div className="space-y-1"><Label>State</Label>
            <Select value={f.stateCode} onValueChange={v => setF({ ...f, stateCode: v })}><SelectTrigger data-testid="select-party-state"><SelectValue placeholder="Auto from GSTIN" /></SelectTrigger>
              <SelectContent>{Object.entries(STATES).map(([k, v]) => <SelectItem key={k} value={k}>{k} · {v}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2 space-y-1"><Label>Address</Label><Input value={f.address} onChange={set("address")} data-testid="input-party-address" /></div>
          <div className="space-y-1"><Label>City</Label><Input value={f.city} onChange={set("city")} data-testid="input-party-city" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>PIN</Label><Input value={f.pincode} maxLength={6} onChange={set("pincode")} data-testid="input-party-pin" /></div>
            <div className="space-y-1"><Label>Distance km</Label><Input type="number" value={f.distanceKm} onChange={set("distanceKm")} data-testid="input-party-distance" /></div>
          </div>
          <DialogFooter className="col-span-2"><Button type="submit" disabled={save.isPending || !f.name || !f.code || !gstOk || !f.gstin} data-testid="button-save-party">Create party</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PartiesPage() {
  const { data, isLoading } = useParties();
  const cfg = useSettings().data;
  const [role, setRole] = useState("all");
  const [open, setOpen] = useState(false);
  const rows = (data ?? []).filter(p => role === "all" || p.role === role);
  return (
    <>
      <PageIntro actions={<Button onClick={() => setOpen(true)} data-testid="button-new-party"><Plus className="h-4 w-4 mr-1" />New party</Button>}>
        Customers, vendors and job workers. The state code decides tax type: same state as your plant → CGST + SGST, other state → IGST.
      </PageIntro>
      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b">
          {[["all", "All"], ["CUSTOMER", "Customers"], ["VENDOR", "Vendors"], ["JOBWORKER", "Job workers"]].map(([v, l]) => (
            <Button key={v} size="sm" variant={role === v ? "default" : "outline"} onClick={() => setRole(v)} data-testid={`button-filter-role-${v}`}>{l}</Button>))}
        </div>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !rows.length ? <Empty>No parties yet</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b bg-muted/40">{["Code", "Name", "Role", "GSTIN", "State", "City", "Tax type"].map(h => <th key={h} className="text-left font-medium px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>{rows.map(p => (
                <tr key={p.id} className="border-b last:border-0" data-testid={`row-party-${p.id}`}>
                  <td className="px-3 py-2 font-mono text-xs">{p.code}</td><td className="px-3">{p.name}</td><td className="px-3 text-xs">{ROLE_LABEL[p.role]}</td>
                  <td className="px-3 font-mono text-xs">{p.gstin}</td><td className="px-3 text-xs">{p.stateCode} · {STATES[p.stateCode]}</td><td className="px-3 text-xs">{p.city}</td>
                  <td className="px-3 text-xs">{cfg && (cfg.stateCode === p.stateCode ? "CGST + SGST" : "IGST")}</td>
                </tr>))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <PartyDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
