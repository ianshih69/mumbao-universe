import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FixedViewport from "@/components/utils/FixedViewport";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MumbaoChatLauncher } from "./components/ai/MumbaoChatLauncher";
import { SiteConstructionNotice } from "./components/layout/SiteConstructionNotice";
import Home from "./pages/Home";
import About from "./pages/About";
import Mumbao from "./pages/Mumbao";
import Admin from "./pages/Admin";
import AdminChats from "./pages/AdminChats";
import AdminShopHome from "./pages/AdminShopHome";
import AdminShopOrders from "./pages/AdminShopOrders";
import AdminShopProducts from "./pages/AdminShopProducts";
import AdminShopInventory from "./pages/AdminShopInventory";
import AdminShopScan from "./pages/AdminShopScan";
import AdminShopPos from "./pages/AdminShopPos";
import AdminShopSocial from "./pages/AdminShopSocial";
import AiChat from "./pages/AiChat";
import Chat from "./pages/Chat";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderComplete from "./pages/OrderComplete";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/admin/chats"} component={AdminChats} />
      <Route path={"/admin/shop"} component={AdminShopHome} />
      <Route path={"/admin/shop/orders"} component={AdminShopOrders} />
      <Route path={"/admin/shop/products"} component={AdminShopProducts} />
      <Route path={"/admin/shop/inventory"} component={AdminShopInventory} />
      <Route path={"/admin/shop/scan"} component={AdminShopScan} />
      <Route path={"/admin/shop/pos"} component={AdminShopPos} />
      <Route path={"/admin/shop/social"} component={AdminShopSocial} />
      <Route path={"/about"} component={About} />
      <Route path={"/ai-chat"} component={AiChat} />
      <Route path={"/chat"} component={Chat} />
      <Route path={"/shop"} component={Shop} />
      <Route path={"/shop/:slug"} component={ProductDetail} />
      <Route path={"/cart"} component={Cart} />
      <Route path={"/checkout"} component={Checkout} />
      <Route path={"/order-complete/:orderNumber"} component={OrderComplete} />
      <Route path={"/about-mumbao"} component={Mumbao} />
      <Route path={"/mumbao"} component={Mumbao} />
      <Route path={"/zh-TW/about-mumbao"} component={Mumbao} />
      <Route path={"/en/about-mumbao"} component={Mumbao} />
      <Route path={"/ja/about-mumbao"} component={Mumbao} />
      <Route path={"/ko/about-mumbao"} component={Mumbao} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [pathname] = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");
  const isAiRoute = pathname === "/ai-chat" || pathname === "/chat";
  const showFrontendNotice = !isAdminRoute && !isAiRoute;

  return (
    <ErrorBoundary>
      <FixedViewport />
      <ThemeProvider
        defaultTheme="light"
      // switchable
      >
        <TooltipProvider>
          <Toaster />
          {showFrontendNotice && <SiteConstructionNotice />}
          <Router />
          {!isAdminRoute && <MumbaoChatLauncher />}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
