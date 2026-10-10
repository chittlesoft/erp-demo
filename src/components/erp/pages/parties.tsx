"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, useAction } from "@/lib/erp/client";
import { STATES, validGstin, type Party } from "@/lib/erp/shared";
import { PageIntro, Empty, StatusBadge } from "../shared";

const ROLES = ["CUSTOMER", "VENDOR", "JOBWORKER"];
const ROLE_LABEL: Record<string, string> = { CUSTOMER: "Customer", VENDOR: "Vendor", JOBWORKER: "Job worker" };

const schema = z.object({
  code: z.string().min(2).transform((s) => s.toUpperCase()),
  name: z.string().min(2),
  role: z.enum(ROLES as never),
  gstin: z.string().refine(validGstin, "Invalid GSTIN — check format or the 15th check digit"),
  stateCode: z.string(),
  address: z.string().min(3),
  city: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/, "6-digit PIN"),
  distanceKm: z.coerce.number().min(0),
});
type Values = z.input<typeof schema>;

function PartyDialog({ party, open, onOpenChange }: { party: Party | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), values: party ? { code: party.code, name: party.name, role: party.role as never, gstin: party.gstin, stateCode: party.stateCode, address: party.address, city: party.city, pincode: party.pincode, distanceKm: party.distanceKm } as never : undefined });
  const create = useAction("POST", "/api/parties", "Party created");
  const update = useAction("PATCH", `/api/parties/${party?.id}`, "Party updated");
  const submit = form.handleSubmit((v) => (party ? update : create).mutate(v as never, { onSuccess: () => onOpenChange(false) }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{party ? `Edit ${party.code}` : "New party"}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="code" render={({ field }) => <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="role" render={({ field }) => <FormItem><FormLabel>Role</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
            <FormField control={form.control} name="gstin" render={({ field }) => <FormItem><FormLabel>GSTIN</FormLabel><FormControl><Input {...field} className="font-mono uppercase" /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="stateCode" render={({ field }) => <FormItem><FormLabel>State</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(STATES).map(([c, n]) => <SelectItem key={c} value={c}>{c} — {n}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
            <FormField control={form.control} name="distanceKm" render={({ field }) => <FormItem><FormLabel>Distance (km)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="address" render={({ field }) => <FormItem className="col-span-2"><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="city" render={({ field }) => <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="pincode" render={({ field }) => <FormItem><FormLabel>PIN</FormLabel><FormControl><Input {...field} className="font-mono" /></FormControl><FormMessage /></FormItem>} />
            <DialogFooter className="col-span-2 mt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={create.isPending || update.isPending}>{party ? "Save" : "Create"}</Button></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function PartiesPage() {
  const { data, isLoading } = useApi<Party[]>("/api/parties");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [edit, setEdit] = useState<Party | null>(null);
  const [open, setOpen] = useState(false);
  const rows = (data ?? []).filter((p) => (role === "all" || p.role === role) && (p.code + p.name + p.gstin).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageIntro actions={<Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New party</Button>}>
        Customers, vendors and job workers with GSTIN validation (format + mod-36 check digit + state-code match). Intra-state → CGST+SGST; inter-state → IGST.
      </PageIntro>
      <div className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap gap-2 p-3 border-b">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search code, name or GSTIN" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={role} onValueChange={setRole}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="overflow-x-auto scroll-thin">
          {isLoading ? <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div> : rows.length === 0 ? <Empty>No parties</Empty> : (
            <table className="zebra w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b">{["Code", "Name", "Role", "GSTIN", "State", "City", "Distance", ""].map((h, i) => <th key={i} className={`font-medium px-5 py-2 ${i === 6 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-5 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-5">{p.name}<span className="text-xs text-muted-foreground block">{p.address}, {p.city} {p.pincode}</span></td>
                    <td className="px-5"><StatusBadge status={p.role} /></td>
                    <td className="px-5 font-mono text-xs">{p.gstin}</td>
                    <td className="px-5 text-xs">{STATES[p.stateCode] ?? p.stateCode}</td>
                    <td className="px-5 text-xs">{p.city}</td>
                    <td className="px-5 text-xs text-right tabular-nums">{p.distanceKm} km</td>
                    <td className="px-2"><Button variant="ghost" size="icon" onClick={() => { setEdit(p); setOpen(true); }} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <PartyDialog party={edit} open={open} onOpenChange={setOpen} />
    </>
  );
}
