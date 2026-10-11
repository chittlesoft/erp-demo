import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATES } from "@shared/schema";
import { API_BASE } from "@/lib/queryClient";
import { useSettings, useAction, type Settings } from "@/lib/erp";
import { PageIntro, StatusBadge } from "@/components/layout";
import { Switch } from "@/components/ui/switch";
import { useP4Config } from "@/components/edoc";

type LogRow = { id: number; ts: string; docType: string; docNo: string; action: string; mode: string; ok: number; message: string };
function GspCard() {
  const cfg = useP4Config().data;
  const log = useQuery<LogRow[]>({ queryKey: ["/api/gsp-log"] }).data ?? [];
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (cfg) setF(cfg); }, [cfg]);
  const save = useAction("PUT", "/api/p4/config", "GST portal & plant settings saved");
  if (!f || !cfg) return null;
  return (
    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 mt-4">
      <Card className="h-fit">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">GST portal connection (e-invoice & e-way bill)</CardTitle>
          <CardDescription className="text-xs">IRNs and e-way bills are generated through a GST Suvidha Provider (GSP). Simulated mode follows the NIC sandbox rules without contacting the portal — use it for training and testing.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Mode</Label>
              <Select value={f.gspMode} onValueChange={v => setF({ ...f, gspMode: v })}><SelectTrigger data-testid="select-gsp-mode"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="SIMULATED">Simulated</SelectItem><SelectItem value="LIVE">Live via GSP</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Environment</Label>
              <Select value={f.gspEnv} onValueChange={v => setF({ ...f, gspEnv: v })}><SelectTrigger data-testid="select-gsp-env"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="SANDBOX">Sandbox</SelectItem><SelectItem value="PRODUCTION">Production</SelectItem></SelectContent></Select></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">GSP / provider name</Label><Input value={f.gspProvider} onChange={e => setF({ ...f, gspProvider: e.target.value })} placeholder="e.g. your ASP / GSP" data-testid="input-gsp-provider" /></div>
          </div>
          {f.gspMode === "LIVE" && cfg.live.missing.length > 0 && <p className="text-[11px] text-destructive" data-testid="text-gsp-missing">Live mode needs these server environment variables from your GSP: {cfg.live.missing.join(", ")}. Until they are set, IRN requests will be refused.</p>}
          <div className="border-t pt-3 space-y-2">
            <label className="flex items-center justify-between gap-3 text-sm"><span>Aggregate turnover above ₹5 Cr<span className="block text-[11px] text-muted-foreground">ITC-04 half-yearly (25 Oct / 25 Apr) instead of annual</span></span>
              <Switch checked={!!f.aatoAbove5Cr} onCheckedChange={v => setF({ ...f, aatoAbove5Cr: v ? 1 : 0 })} data-testid="switch-aato5" /></label>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Aggregate turnover ₹10 Cr or more<span className="block text-[11px] text-muted-foreground">Documents must be reported to the IRP within 30 days</span></span>
              <Switch checked={!!f.aato10Cr} onCheckedChange={v => setF({ ...f, aato10Cr: v ? 1 : 0 })} data-testid="switch-aato10" /></label>
            <div className="flex items-center justify-between gap-3 text-sm"><span>Planned production minutes per station per day<span className="block text-[11px] text-muted-foreground">Used for OEE availability</span></span>
              <Input className="w-24 text-right" inputMode="numeric" value={f.plannedMin} onChange={e => setF({ ...f, plannedMin: +e.target.value.replace(/\D/g, "") || 0 })} data-testid="input-planned-min" /></div>
          </div>
          <div className="flex justify-end"><Button disabled={save.isPending} onClick={() => save.mutate({ gspMode: f.gspMode, gspProvider: f.gspProvider, gspEnv: f.gspEnv, aatoAbove5Cr: f.aatoAbove5Cr, aato10Cr: f.aato10Cr, plannedMin: f.plannedMin })} data-testid="button-save-gsp">Save</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GST portal API log</CardTitle><CardDescription className="text-xs">Every IRN, cancellation and e-way bill request, kept for audit.</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto max-h-96 overflow-y-auto">{!log.length ? <p className="p-4 text-sm text-muted-foreground">No requests yet.</p> :
          <table className="w-full text-xs"><thead className="sticky top-0 bg-card"><tr className="border-y bg-muted/40 text-muted-foreground"><th className="text-left font-medium p-2">Time (UTC)</th><th className="text-left font-medium p-2">Document</th><th className="text-left font-medium p-2">Action</th><th className="text-left font-medium p-2">Result</th></tr></thead>
            <tbody>{log.map(l => <tr key={l.id} className="border-b align-top" data-testid={`row-gsp-log-${l.id}`}><td className="p-2 tabular-nums whitespace-nowrap">{l.ts.slice(5, 16)}</td><td className="p-2"><span className="font-mono">{l.docNo}</span><div className="text-muted-foreground">{l.docType} · {l.mode.toLowerCase()}</div></td><td className="p-2">{l.action.replace(/_/g, " ").toLowerCase()}</td>
              <td className="p-2"><StatusBadge status={l.ok ? "PASS" : "FAIL"} /><div className="mt-0.5 text-muted-foreground break-words max-w-xs">{l.message}</div></td></tr>)}</tbody></table>}</CardContent>
      </Card>
    </div>
  );
}

export default function AccountsPage() {
  const cfg = useSettings().data;
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => { if (cfg) setF(cfg); }, [cfg]);
  const save = useAction("PATCH", "/api/settings", "Company settings saved");
  const fyStart = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-04-01`; })();
  const [range, setRange] = useState({ from: fyStart, to: new Date().toISOString().slice(0, 10) });
  const preview = useQuery<{ xml: string; count: number }>({ queryKey: [`/api/tally/preview?from=${range.from}&to=${range.to}`] });
  if (!f) return null;
  const txt = (k: keyof Settings, label: string, mono = false) => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className={mono ? "font-mono" : ""} value={String(f[k] ?? "")} onChange={e => setF({ ...f, [k]: k === "gstin" ? e.target.value.toUpperCase() : e.target.value })} data-testid={`input-settings-${k}`} /></div>
  );
  return (
    <>
      <PageIntro>Tally Prime remains your books of accounts. The ERP exports sales invoices and purchase GRNs as Tally XML vouchers (accounting voucher view); inventory stays in the ERP.</PageIntro>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Export vouchers to Tally Prime</CardTitle>
            <CardDescription className="text-xs">Tally Prime → Import → Transactions → choose this XML file. Party ledgers and the GST ledgers below must already exist in Tally with the same names.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} data-testid="input-tally-from" /></div>
              <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} data-testid="input-tally-to" /></div>
              <a href={`${API_BASE}/api/tally/vouchers.xml?from=${range.from}&to=${range.to}`} target="_blank" rel="noopener noreferrer"><Button data-testid="button-download-tally"><Download className="h-4 w-4 mr-1" />Download XML</Button></a>
            </div>
            <div className="text-xs text-muted-foreground" data-testid="text-tally-count">{preview.data ? `${preview.data.count} vouchers in range` : "…"}</div>
            <pre className="text-[10.5px] leading-snug bg-muted/50 rounded p-3 max-h-72 overflow-auto font-mono whitespace-pre-wrap break-all">{preview.data?.xml.slice(0, 2400)}{(preview.data?.xml.length ?? 0) > 2400 ? "\n…" : ""}</pre>
            <div className="text-xs text-muted-foreground">Ledgers used: {f.salesLedger}, {f.purchaseLedger}, Output/Input CGST, SGST, IGST, Round Off.</div>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Company & GST details</CardTitle><CardDescription className="text-xs">Printed on invoices and used in e-invoice JSON. Loaded from tau-power.com and MCA records; add your GSTIN.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="col-span-2">{txt("legalName", "Legal name")}</div>
            <div className="space-y-1">{txt("gstin", "GSTIN", true)}{!f.gstin && <p className="text-[11px] text-[hsl(var(--chart-2))]">Required for invoices & e-invoice JSON</p>}</div>
            <div className="space-y-1"><Label className="text-xs">State</Label>
              <Select value={f.stateCode} onValueChange={v => setF({ ...f, stateCode: v })}><SelectTrigger data-testid="select-settings-state"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATES).map(([k, v]) => <SelectItem key={k} value={k}>{k} · {v}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2">{txt("address", "Registered office address")}</div>
            {txt("city", "City")}{txt("pincode", "PIN")}
            <div className="col-span-2">{txt("plantAddress", "Plant / dispatch-from address")}</div>
            {txt("plantCity", "Plant city")}{txt("plantPincode", "Plant PIN")}
            {txt("cin", "CIN", true)}{txt("phone", "Phone")}
            {txt("email", "Email")}{txt("certifications", "Certifications (printed on invoice)")}
            <div className="col-span-2">{txt("tallyCompany", "Tally company name")}</div>
            {txt("salesLedger", "Sales ledger")}{txt("purchaseLedger", "Purchase ledger")}
            <div className="col-span-2 flex justify-end"><Button disabled={save.isPending} onClick={() => { const { id, ...rest } = f; save.mutate(rest); }} data-testid="button-save-settings">Save settings</Button></div>
          </CardContent>
        </Card>
      </div>
      <GspCard />
    </>
  );
}
