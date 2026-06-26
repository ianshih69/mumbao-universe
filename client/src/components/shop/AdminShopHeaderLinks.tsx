import { Link, useLocation } from "wouter";
import FrontendPreviewMenu, { frontendPreviewLinks } from "@/components/shop/FrontendPreviewMenu";
import { clearAdminToken } from "@/lib/shop/adminAuth";

const adminHeaderLinkClassName =
  "inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50";

const mobileMenuItemClassName =
  "flex min-h-11 w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-stone-700 transition hover:bg-[#f7f1e9]";

type AdminShopHeaderLinksProps = {
  context?: "shop" | "bookings";
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  showLogout?: boolean;
};

export default function AdminShopHeaderLinks({
  context = "shop",
  onRefresh,
  isRefreshing = false,
  showLogout = context === "shop",
}: AdminShopHeaderLinksProps) {
  const [, setLocation] = useLocation();
  const secondaryLink =
    context === "bookings"
      ? { label: "文創商城後台", href: "/admin/shop" }
      : { label: "房況管理", href: "/admin/bookings" };

  const logout = () => {
    clearAdminToken();
    setLocation("/admin/shop/login");
  };

  return (
    <>
      <span className="hidden md:contents">
        <Link href="/account" className={adminHeaderLinkClassName}>
          管理入口
        </Link>
        <Link href={secondaryLink.href} className={adminHeaderLinkClassName}>
          {secondaryLink.label}
        </Link>
        <FrontendPreviewMenu />
      </span>

      <details className="relative md:hidden">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
          管理選單
        </summary>
        <div className="absolute left-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-2 shadow-xl shadow-stone-300/40">
          <Link href="/account" className={mobileMenuItemClassName}>
            管理入口
          </Link>
          <Link href={secondaryLink.href} className={mobileMenuItemClassName}>
            {secondaryLink.label}
          </Link>

          <div className="mt-2 border-t border-stone-100 pt-2">
            <p className="px-3 pb-1 text-xs font-semibold text-stone-400">前台預覽</p>
            {frontendPreviewLinks.map((link) => (
              <Link key={link.href} href={link.href} className={mobileMenuItemClassName}>
                {link.label}
              </Link>
            ))}
          </div>

          {(onRefresh || showLogout) && (
            <div className="mt-2 border-t border-stone-100 pt-2">
              {onRefresh && (
                <button
                  type="button"
                  className={mobileMenuItemClassName}
                  disabled={isRefreshing}
                  onClick={() => void onRefresh()}
                >
                  {isRefreshing ? "重新整理中..." : "重新整理"}
                </button>
              )}
              {showLogout && (
                <button type="button" className={mobileMenuItemClassName} onClick={logout}>
                  登出
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-stone-100 px-3 py-2.5 text-sm font-medium text-stone-600"
            onClick={(event) => {
              const menu = event.currentTarget.closest("details");
              if (menu) menu.open = false;
            }}
          >
            關閉
          </button>
        </div>
      </details>
    </>
  );
}
