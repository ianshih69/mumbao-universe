import { Link } from "wouter";

const adminHeaderLinkClassName =
  "inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50";

export default function AdminShopHeaderLinks() {
  return (
    <>
      <Link href="/account" className={adminHeaderLinkClassName}>
        管理入口
      </Link>
      <Link href="/admin/bookings" className={adminHeaderLinkClassName}>
        房況管理
      </Link>
    </>
  );
}
