import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FixedViewport from "@/components/utils/FixedViewport";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CustomerAuthProvider } from "./contexts/CustomerAuthContext";
import { MumbaoChatLauncher } from "./components/ai/MumbaoChatLauncher";
import { SiteConstructionNotice } from "./components/layout/SiteConstructionNotice";
import { ScrollToTop } from "./components/layout/ScrollToTop";
import Home from "./pages/Home";
import About from "./pages/About";
import Breakfast from "./pages/Breakfast";
import SlowGuide from "./pages/SlowGuide";
import RoomsPage from "./pages/Rooms";
import RoomDetail from "./pages/RoomDetail";
import NewsPage from "./pages/News";
import NewsDetail from "./pages/NewsDetail";
import Mumbao from "./pages/Mumbao";
import Admin from "./pages/Admin";
import AdminChats from "./pages/AdminChats";
import AdminShopHome from "./pages/AdminShopHome";
import AdminShopOrders from "./pages/AdminShopOrders";
import AdminShopProducts from "./pages/AdminShopProducts";
import AdminShopInventory from "./pages/AdminShopInventory";
import AdminShopScan from "./pages/AdminShopScan";
import AdminShopPos from "./pages/AdminShopPos";
import AdminShopWarehouse from "./pages/AdminShopWarehouse";
import AdminShopLogin from "./pages/AdminShopLogin";
import AdminShopUsers from "./pages/AdminShopUsers";
import AdminShopAuditLogs from "./pages/AdminShopAuditLogs";
import AdminShopAccount from "./pages/AdminShopAccount";
import AdminBookings from "./pages/AdminBookings";
import AdminSite from "./pages/AdminSite";
import AiChat from "./pages/AiChat";
import Chat from "./pages/Chat";
import Booking from "./pages/Booking";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderComplete from "./pages/OrderComplete";
import OrderLookup from "./pages/OrderLookup";
import CustomerAccount from "./pages/CustomerAccount";
import CustomerLogin from "./pages/CustomerLogin";
import CustomerRegister from "./pages/CustomerRegister";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import DataDeletion from "./pages/DataDeletion";


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
      <Route path={"/admin/shop/warehouse"} component={AdminShopWarehouse} />
      <Route path={"/admin/shop/login"} component={AdminShopLogin} />
      <Route path={"/admin/shop/account"} component={AdminShopAccount} />
      <Route path={"/admin/shop/users"} component={AdminShopUsers} />
      <Route path={"/admin/shop/audit-logs"} component={AdminShopAuditLogs} />
      <Route path={"/admin/bookings"} component={AdminBookings} />
      <Route path={"/admin/site"} component={AdminSite} />
      <Route path={"/about"} component={About} />
      <Route path={"/experience/breakfast"} component={Breakfast} />
      <Route path={"/experience/slow-guide"} component={SlowGuide} />
      <Route path={"/rooms/:slug"} component={RoomDetail} />
      <Route path={"/rooms"} component={RoomsPage} />
      <Route path={"/news/:slug"} component={NewsDetail} />
      <Route path={"/news"} component={NewsPage} />
      <Route path={"/ai-chat"} component={AiChat} />
      <Route path={"/chat"} component={Chat} />
      <Route path={"/booking"} component={Booking} />
      <Route path={"/shop"} component={Shop} />
      <Route path={"/shop/:slug"} component={ProductDetail} />
      <Route path={"/cart"} component={Cart} />
      <Route path={"/checkout"} component={Checkout} />
      <Route path={"/order-complete/:orderNumber"} component={OrderComplete} />
      <Route path={"/order/lookup"} component={OrderLookup} />
      <Route path={"/account"} component={CustomerAccount} />
      <Route path={"/account/login"} component={CustomerLogin} />
      <Route path={"/account/register"} component={CustomerRegister} />
      <Route path={"/account/forgot-password"} component={ForgotPassword} />
      <Route path={"/account/reset-password"} component={ResetPassword} />
      <Route path={"/privacy"} component={Privacy} />
      <Route path={"/terms"} component={Terms} />
      <Route path={"/data-deletion"} component={DataDeletion} />
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
          <CustomerAuthProvider>
            <Toaster />
            {showFrontendNotice && <SiteConstructionNotice />}
            <ScrollToTop />
            <Router />
            {!isAdminRoute && <MumbaoChatLauncher />}
          </CustomerAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
