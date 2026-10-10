"use client";
import { useState } from "react";
import { Search, ScanSearch, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/erp/client";
import { PageIntro, Empty, StatusBadge } from "../shared";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type SerialTrace = {
  serial: { serialNo: string; eolResult: string; eolData: string; date: string; status: string };
  item: { code: string; name: string; productLine: string | null; customerPartNo: string | null } | null;
  order: { orderNo: string; qty: number; dueDate: string } | null;
  components: { itemId: number; batchNo: string | null; qty: number; item: { code: string; name: string } | null }[];
  dispatch: { invNo: string; date: string; customer: string } | null;
};
type BatchTrace = { order: { orderNo: string; qty: number; dueDate: string }; item: { code: string; name: string } | null; serials: { serialNo: string; eolResult: string; status: string }[] }[];

export default function TracePage() {
  const [serialNo, setSerialNo] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [serialQuery, setSerialQuery] = useState("");
  const [batchQuery, setBatchQuery] = useState("");

  const serial = useApi<SerialTrace>(`/api/trace/serial?no=${encodeURIComponent(serialQuery)}`, !!serialQuery);
  const batch = useApi<BatchTrace>(`/api/trace/batch?no=${encodeURIComponent(batchQuery)}`, !!batchQuery);

  return (
    <>
      <PageIntro>
        Forward &amp; reverse traceability — trace a finished sensor serial back to its component batches, or recall every order/serial that consumed a raw-material batch.
      </PageIntro>
      <Tabs defaultValue="serial">
        <TabsList><TabsTrigger value="serial"><ScanSearch className="h-3.5 w-3.5 mr-1.5" />By serial</TabsTrigger><TabsTrigger value="batch"><PackageX className="h-3.5 w-3.5 mr-1.5" />By batch</TabsTrigger></TabsList>

        <TabsContent value="serial" className="mt-4">
          <div className="flex gap-2 mb-4">
            <Input placeholder="Enter serial no. (e.g. EGT-2609-00042)" value={serialNo} onChange={(e) => setSerialNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSerialQuery(serialNo)} />
            <Button onClick={() => setSerialQuery(serialNo)}><Search className="h-4 w-4 mr-1" />Trace</Button>
          </div>
          {!serialQuery ? <Empty>Enter a serial to trace it</Empty> :
            serial.isLoading ? <Skeleton className="h-40" /> :
            serial.data?.notFound ? <Empty>Serial not found</Empty> :
            serial.data && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-card shadow-xs p-5">
                  <div className="flex items-center gap-2 mb-3"><h2 className="text-sm font-semibold font-mono">{serial.data.serial.serialNo}</h2><StatusBadge status={serial.data.serial.status} /></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><div className="text-xs text-muted-foreground">Product</div><div className="font-mono text-xs">{serial.data.item?.code}</div><div className="text-xs text-muted-foreground">{serial.data.item?.name}</div></div>
                    <div><div className="text-xs text-muted-foreground">Production order</div><div className="font-mono text-xs">{serial.data.order?.orderNo}</div><div className="text-xs text-muted-foreground">Due {serial.data.order?.dueDate}</div></div>
                    <div><div className="text-xs text-muted-foreground">EOL result</div><div><StatusBadge status={serial.data.serial.eolResult} /></div><div className="text-xs text-muted-foreground">{serial.data.serial.date}</div></div>
                    <div><div className="text-xs text-muted-foreground">Customer part no.</div><div className="font-mono text-xs">{serial.data.item?.customerPartNo ?? "—"}</div></div>
                  </div>
                  {serial.data.serial.eolData && serial.data.serial.eolData !== "{}" && (
                    <div className="mt-3 pt-3 border-t"><div className="text-xs text-muted-foreground mb-1">EOL test values</div>
                      <div className="flex flex-wrap gap-2">{Object.entries(JSON.parse(serial.data.serial.eolData)).map(([k, v]) => <span key={k} className="text-xs rounded bg-muted px-2 py-1">{k}: <span className="font-mono">{String(v)}</span></span>)}</div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border bg-card shadow-xs p-5">
                  <h3 className="text-sm font-semibold mb-2">Component batches consumed</h3>
                  <table className="zebra w-full text-sm table-compact">
                    <thead><tr className="text-xs text-muted-foreground border-b">{["Component", "Batch", "Qty"].map((h, i) => <th key={i} className={`font-medium px-3 py-1.5 ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                    <tbody>
                      {serial.data.components.map((c, i) => (
                        <tr key={i} className="border-b last:border-0"><td className="px-3 py-1.5 font-mono text-xs">{c.item?.code}</td><td className="px-3 font-mono text-xs">{c.batchNo ?? "—"}</td><td className="px-3 text-right tabular-nums">{c.qty}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {serial.data.dispatch && (
                  <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 p-5"><h3 className="text-sm font-semibold mb-1">Dispatched</h3><div className="text-sm">Invoice <span className="font-mono">{serial.data.dispatch.invNo}</span> on {serial.data.dispatch.date} to {serial.data.dispatch.customer}</div></div>
                )}
              </div>
            )}
        </TabsContent>

        <TabsContent value="batch" className="mt-4">
          <div className="flex gap-2 mb-4">
            <Input placeholder="Enter raw-material batch no. (e.g. TC-2609-110)" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setBatchQuery(batchNo)} />
            <Button onClick={() => setBatchQuery(batchNo)}><Search className="h-4 w-4 mr-1" />Recall</Button>
          </div>
          {!batchQuery ? <Empty>Enter a batch to find affected orders &amp; serials</Empty> :
            batch.isLoading ? <Skeleton className="h-40" /> :
            (batch.data ?? []).length === 0 ? <Empty>No orders consumed this batch</Empty> :
            <div className="space-y-3">
              {(batch.data ?? []).map((o, i) => (
                <div key={i} className="rounded-xl border bg-card shadow-xs p-5">
                  <div className="flex items-center gap-2 mb-2"><span className="font-mono text-sm">{o.order.orderNo}</span><span className="text-xs text-muted-foreground">{o.item?.code} — {o.item?.name}</span></div>
                  <div className="text-xs text-muted-foreground mb-2">Order qty {o.order.qty} · {o.serials.length} serials produced</div>
                  <div className="flex flex-wrap gap-1.5">{o.serials.map((s) => <span key={s.serialNo} className={`text-[11px] font-mono rounded px-1.5 py-0.5 ${s.status === "REJECTED" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-muted"}`}>{s.serialNo}</span>)}</div>
                </div>
              ))}
            </div>}
        </TabsContent>
      </Tabs>
    </>
  );
}
