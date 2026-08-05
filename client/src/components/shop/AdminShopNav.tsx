type AdminShopNavKey =
  | "home"
  | "products"
  | "orders"
  | "inventory"
  | "scan"
  | "pos"
  | "warehouse"
  | "account"
  | "members"
  | "point-redemptions"
  | "users"
  | "audit";

type AdminShopNavProps = {
  current?: AdminShopNavKey;
};

export default function AdminShopNav(_props: AdminShopNavProps) {
  return null;
}
