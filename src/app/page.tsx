"use client";
import { Layout } from "@/components/erp/layout";
import { useNav } from "@/lib/erp/nav";
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/erp/pages/dashboard"));
const Items = dynamic(() => import("@/components/erp/pages/items"));
const Bom = dynamic(() => import("@/components/erp/pages/bom"));
const Inventory = dynamic(() => import("@/components/erp/pages/inventory"));
const Production = dynamic(() => import("@/components/erp/pages/production"));
const Planning = dynamic(() => import("@/components/erp/pages/planning"));
const Trace = dynamic(() => import("@/components/erp/pages/trace"));
const Parties = dynamic(() => import("@/components/erp/pages/parties"));
const Purchase = dynamic(() => import("@/components/erp/pages/purchase"));
const Sales = dynamic(() => import("@/components/erp/pages/sales"));
const Accounts = dynamic(() => import("@/components/erp/pages/accounts"));
const ShopFloor = dynamic(() => import("@/components/erp/pages/shopfloor"));
const Quality = dynamic(() => import("@/components/erp/pages/quality"));
const Warehouse = dynamic(() => import("@/components/erp/pages/warehouse"));
const Analytics = dynamic(() => import("@/components/erp/pages/analytics"));
const JobWork = dynamic(() => import("@/components/erp/pages/jobwork"));
const Users = dynamic(() => import("@/components/erp/pages/users"));

export default function Home() {
  const { view } = useNav();
  return (
    <Layout>
      {view === "dashboard" && <Dashboard />}
      {view === "items" && <Items />}
      {view === "bom" && <Bom />}
      {view === "inventory" && <Inventory />}
      {view === "production" && <Production />}
      {view === "planning" && <Planning />}
      {view === "trace" && <Trace />}
      {view === "parties" && <Parties />}
      {view === "purchase" && <Purchase />}
      {view === "sales" && <Sales />}
      {view === "accounts" && <Accounts />}
      {view === "shopfloor" && <ShopFloor />}
      {view === "quality" && <Quality />}
      {view === "warehouse" && <Warehouse />}
      {view === "analytics" && <Analytics />}
      {view === "jobwork" && <JobWork />}
      {view === "users" && <Users />}
    </Layout>
  );
}
