import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Items from "@/pages/items";
import Bom from "@/pages/bom";
import Inventory from "@/pages/inventory";
import Production from "@/pages/production";
import Planning from "@/pages/planning";
import Trace from "@/pages/trace";
import Parties from "@/pages/parties";
import Purchase from "@/pages/purchase";
import Sales from "@/pages/sales";
import InvoiceView from "@/pages/invoice";
import Accounts from "@/pages/accounts";
import ShopFloor from "@/pages/shopfloor";
import WarehousePage from "@/pages/warehouse";
import Quality from "@/pages/quality";
import { PdiReportPage } from "@/pages/pdi";
import JobWork, { ChallanPage, JwInvoicePage } from "@/pages/jobwork";
import { NotePage } from "@/pages/notes";
import Analytics from "@/pages/analytics";

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/items" component={Items} />
        <Route path="/bom" component={Bom} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/production" component={Production} />
        <Route path="/planning" component={Planning} />
        <Route path="/trace" component={Trace} />
        <Route path="/parties" component={Parties} />
        <Route path="/purchase" component={Purchase} />
        <Route path="/sales" component={Sales} />
        <Route path="/invoice/:id" component={InvoiceView} />
        <Route path="/pdi/:id" component={PdiReportPage} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/shopfloor" component={ShopFloor} />
        <Route path="/warehouse" component={WarehousePage} />
        <Route path="/quality" component={Quality} />
        <Route path="/jobwork" component={JobWork} />
        <Route path="/challan/:id" component={ChallanPage} />
        <Route path="/jw-invoice/:id" component={JwInvoicePage} />
        <Route path="/note/:id" component={NotePage} />
        <Route path="/analytics" component={Analytics} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
