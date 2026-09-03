import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AdminLayout from "@/components/admin/AdminLayout";
import FixedViewport from "@/components/utils/FixedViewport";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CustomerAuthProvider } from "./contexts/CustomerAuthContext";
import { MumbaoChatLauncher } from "./components/ai/MumbaoChatLauncher";
import { ScrollToTop } from "./components/layout/ScrollToTop";
import { ShopTestGate } from "./components/shop/ShopTestGate";
import Home from "./pages/Home";
import About from "./pages/About";
import Breakfast from "./pages/Breakfast";
import SlowGuide from "./pages/SlowGuide";
import WholeHouse from "./pages/WholeHouse";
import RoomsPage from "./pages/Rooms";
import RoomDetail from "./pages/RoomDetail";
import NewsPage from "./pages/News";
import NewsDetail from "./pages/NewsDetail";
import Mumbao from "./pages/Mumbao";
import Admin from "./pages/Admin";
import AdminOverview from "./pages/AdminOverview";
import AdminChats from "./pages/AdminChats";
import AdminMemberDetail from "./pages/AdminMemberDetail";
import AdminMembers from "./pages/AdminMembers";
import AdminPointRedemptions from "./pages/AdminPointRedemptions";
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
import AdminBookingOrders from "./pages/AdminBookingOrders";
import AdminBookingPricing from "./pages/AdminBookingPricing";
import AdminSite from "./pages/AdminSite";
import AiChat from "./pages/AiChat";
import Chat from "./pages/Chat";
import Booking from "./pages/Booking";
import BookingLookup from "./pages/BookingLookup";
import BookingManage from "./pages/BookingManage";
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

function AdminPage({
  title,
  children,
  contentClassName,
}: {
  title: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <AdminLayout title={title} contentClassName={contentClassName}>
      {children}
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/admin/shop/login"} component={AdminShopLogin} />
      <Route path={"/admin/legacy-content"}>
        <AdminPage title="舊版內容管理">
          <Admin embeddedInAdminLayout />
        </AdminPage>
      </Route>
      <Route path={"/admin/chats"}>
        <AdminPage title="問慢寶客服" contentClassName="min-h-0">
          <AdminChats />
        </AdminPage>
      </Route>
      <Route path={"/admin/members/:memberId"}>
        <AdminPage title="會員詳細資料">
          <AdminMemberDetail />
        </AdminPage>
      </Route>
      <Route path={"/admin/members"}>
        <AdminPage title="會員">
          <AdminMembers />
        </AdminPage>
      </Route>
      <Route path={"/admin/point-redemptions"}>
        <AdminPage title="積分兌換">
          <AdminPointRedemptions />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/orders"}>
        <AdminPage title="商城訂單">
          <AdminShopOrders />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/products"}>
        <AdminPage title="商品">
          <AdminShopProducts />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/inventory"}>
        <AdminPage title="庫存">
          <AdminShopInventory />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/scan"}>
        <AdminPage title="入庫">
          <AdminShopScan />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/pos"}>
        <AdminPage title="POS">
          <AdminShopPos />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/warehouse"}>
        <AdminPage title="倉儲與資產">
          <AdminShopWarehouse />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/account"}>
        <AdminPage title="帳號設定">
          <AdminShopAccount />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/users"}>
        <AdminPage title="管理員／使用者">
          <AdminShopUsers />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop/audit-logs"}>
        <AdminPage title="操作紀錄">
          <AdminShopAuditLogs />
        </AdminPage>
      </Route>
      <Route path={"/admin/shop"}>
        <AdminPage title="商城總覽">
          <AdminShopHome />
        </AdminPage>
      </Route>
      <Route path={"/admin/bookings/pricing"}>
        <AdminPage title="房價管理">
          <AdminBookingPricing />
        </AdminPage>
      </Route>
      <Route path={"/admin/bookings/orders"}>
        <AdminPage title="官網訂單管理">
          <AdminBookingOrders />
        </AdminPage>
      </Route>
      <Route path={"/admin/bookings"}>
        <AdminPage title="房況與訂房管理">
          <AdminBookings />
        </AdminPage>
      </Route>
      <Route path={"/admin/site"}>
        <AdminPage title="官網內容管理">
          <AdminSite />
        </AdminPage>
      </Route>
      <Route path={"/admin"}>
        <AdminPage title="管理總覽">
          <AdminOverview />
        </AdminPage>
      </Route>
      <Route path={"/about"} component={About} />
      <Route path={"/stay/whole-house"} component={WholeHouse} />
      <Route path={"/experience/breakfast"} component={Breakfast} />
      <Route path={"/experience/slow-guide"} component={SlowGuide} />
      <Route path={"/rooms/:slug"} component={RoomDetail} />
      <Route path={"/rooms"} component={RoomsPage} />
      <Route path={"/news/:slug"} component={NewsDetail} />
      <Route path={"/news"} component={NewsPage} />
      <Route path={"/ai-chat"} component={AiChat} />
      <Route path={"/chat"} component={Chat} />
      <Route path={"/booking"} component={Booking} />
      <Route path={"/booking/lookup"} component={BookingLookup} />
      <Route path={"/booking/manage"} component={BookingManage} />
      <Route path={"/shop"}>
        <ShopTestGate>
          <Shop />
        </ShopTestGate>
      </Route>
      <Route path={"/shop/:slug"}>
        <ShopTestGate>
          <ProductDetail />
        </ShopTestGate>
      </Route>
      <Route path={"/cart"}>
        <ShopTestGate>
          <Cart />
        </ShopTestGate>
      </Route>
      <Route path={"/checkout"}>
        <ShopTestGate>
          <Checkout />
        </ShopTestGate>
      </Route>
      <Route path={"/order-complete/:orderNumber"}>
        <ShopTestGate>
          <OrderComplete />
        </ShopTestGate>
      </Route>
      <Route path={"/order/lookup"}>
        <ShopTestGate>
          <OrderLookup />
        </ShopTestGate>
      </Route>
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
