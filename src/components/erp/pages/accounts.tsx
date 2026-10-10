"use client";
import { useState } from "react";
import { Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useAction, inr2 } from "@/lib/erp/client";
import type { Settings } from "@/lib/erp/shared";
import { STATES } from "@/lib/erp/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageIntro } from "../shared";

export default function AccountsPage() {
  const { data, isLoading } = useApi<Settings>("/api/settings");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const tally = useApi<{ company: string; from: string; to: string; sales: { voucher: string; date: string; invNo: string; taxable: number; total: number }[]; purchase: { voucher: string; date: string; grnNo: string; vendorInvoiceNo: string; party: string; total: number }[] }>(`/api/tally?from=${from}&to=${to}`);
  if (isLoading || !data) return <Skeleton className="h-64" />;
  return (
    <>
      <PageIntro>Company profile, GSTIN and Tally Prime voucher export for parallel run with books of accounts.</PageIntro>
      <div className="grid lg:grid-cols-2 gap-4">
        <CompanyCard settings={data} />
        <TallyCard tally={tally.data} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
    </>
  );
}

function CompanyCard({ settings }: { settings: Settings }) {
  const update = useAction("PATCH", "/api/settings", "Company settings saved");
  const [d, setD] = useState(settings);
  const submit = () => update.mutate(d);
  const field = (k: keyof Settings, label: string, mono = false, wide = false) => (
    <div className={wide ? "col-span-2" : ""}>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1" value={String(d[k] ?? "")} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="rounded-xl border bg-card shadow-xs p-5">
      <h2 className="text-sm font-semibold mb-3">Company profile</h2>
      <div className="grid grid-cols-2 gap-3">
        {field("legalName", "Legal name", false, true)}
        {field("gstin", "GSTIN", true)}
        <div><Label className="text-xs">State</Label><Select value={d.stateCode} onValueChange={(v) => setD({ ...d, stateCode: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATES).map(([c, n]) => <SelectItem key={c} value={c}>{c} — {n}</SelectItem>)}</SelectContent></Select></div>
        {field("cin", "CIN", true, true)}
        {field("address", "Registered address", false, true)}
        {field("city", "City")}
        {field("pincode", "PIN", true)}
        {field("phone", "Phone")}
        {field("email", "Email")}
        {field("plantAddress", "Plant address", false, true)}
        {field("plantCity", "Plant city")}
        {field("plantPincode", "Plant PIN", true)}
        {field("certifications", "Certifications", false, true)}
      </div>
      <div className="mt-4"><Button onClick={submit} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />Save settings</Button></div>
    </div>
  );
}

function TallyCard({ tally, from, to, setFrom, setTo }: { tally: { company: string; from: string; to: string; sales: { voucher: string; date: string; invNo: string; taxable: number; total: number }[]; purchase: { voucher: string; date: string; grnNo: string; vendorInvoiceNo: string; party: string; total: number }[] } | undefined; from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(tally, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `tally-${from}-to-${to}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="rounded-xl border bg-card shadow-xs p-5">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold">Tally Prime voucher export</h2>
        <div className="ml-auto flex items-center gap-2">
          <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button size="sm" variant="outline" onClick={download}><Download className="h-3.5 w-3.5 mr-1" />JSON</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Sales vouchers</div><div className="text-xl font-semibold tabular-nums">{tally?.sales.length ?? 0}</div><div className="text-xs text-muted-foreground">{inr2(tally?.sales.reduce((s, x) => s + x.total, 0) ?? 0)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Purchase vouchers</div><div className="text-xl font-semibold tabular-nums">{tally?.purchase.length ?? 0}</div><div className="text-xs text-muted-foreground">{inr2(tally?.purchase.reduce((s, x) => s + x.total, 0) ?? 0)}</div></div>
      </div>
      <div className="text-xs text-muted-foreground">
        Mapping: Sales = Party Dr / Sales Cr / Output CGST+SGST or IGST Cr. Purchase = Party Cr / Purchase Dr / Input CGST+SGST or IGST Dr. Ledgers must exist in Tally with identical names.
      </div>
    </div>
  );
}
