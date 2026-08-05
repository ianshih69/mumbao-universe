type AdminShopHeaderLinksProps = {
  context?: "shop" | "bookings" | "site";
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  showLogout?: boolean;
};

export default function AdminShopHeaderLinks(_props: AdminShopHeaderLinksProps) {
  return null;
}
