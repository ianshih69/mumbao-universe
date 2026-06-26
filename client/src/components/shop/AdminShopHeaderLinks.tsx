import { useEffect, useState } from "react";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const secondaryLink =
    context === "bookings"
      ? { label: "文創商城後台", href: "/admin/shop" }
      : { label: "房況管理", href: "/admin/bookings" };

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const logout = () => {
    closeMobileMenu();
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

      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 md:hidden"
        aria-expanded={isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen((open) => !open)}
      >
        管理選單
      </button>

      {isMobileMenuOpen && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="關閉管理選單"
            className="fixed inset-0 z-[999] bg-stone-950/35"
            onClick={closeMobileMenu}
          />
          <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[1000] max-h-[calc(100svh-6rem)] overflow-y-auto rounded-3xl border border-stone-200 bg-white p-3 shadow-2xl shadow-stone-950/30">
            <div className="mb-2 flex items-center justify-between gap-3 px-2">
              <p className="text-sm font-semibold text-stone-900">管理選單</p>
              <button
                type="button"
                className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600"
                onClick={closeMobileMenu}
              >
                關閉
              </button>
            </div>

            <Link href="/account" className={mobileMenuItemClassName} onClick={closeMobileMenu}>
              管理入口
            </Link>
            <Link href={secondaryLink.href} className={mobileMenuItemClassName} onClick={closeMobileMenu}>
              {secondaryLink.label}
            </Link>

            <div className="mt-2 border-t border-stone-100 pt-2">
              <p className="px-3 pb-1 text-xs font-semibold text-stone-400">前台預覽</p>
              {frontendPreviewLinks.map((link) => (
                <Link key={link.href} href={link.href} className={mobileMenuItemClassName} onClick={closeMobileMenu}>
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
                    onClick={() => {
                      closeMobileMenu();
                      void onRefresh();
                    }}
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
          </div>
        </div>
      )}
    </>
  );
}
