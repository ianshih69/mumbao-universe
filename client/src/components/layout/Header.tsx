import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Globe, X, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { asArray, asBoolean, asString, fetchSiteGlobalContent } from "@/lib/site/siteContentApi";

type MenuItem = {
  label: string;
  href: string;
  internal: boolean;
  sort_order?: number;
};

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cmsMenuItems, setCmsMenuItems] = useState<MenuItem[] | null>(null);
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user, signOut } = useCustomerAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogoClick = () => {
    if (location === "/") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setLocation("/");
      window.scrollTo(0, 0);
    }
  };

  const localeMatch = location.match(/^\/(zh-TW|en|ja|ko)(?=\/|$)/);
  const localePrefix = localeMatch ? `/${localeMatch[1]}` : "";

  const fallbackMenuItems: MenuItem[] = [
    { label: "關於我們", href: "/about", internal: true },
    { label: "最新消息", href: "/#news", internal: false },
    { label: "認識慢寶", href: `${localePrefix}/about-mumbao`, internal: true },
    { label: "房型介紹", href: "/#rooms", internal: false },
    { label: "線上訂房", href: "/booking", internal: true },
    { label: "宇宙碎品", href: "/shop", internal: true },
    { label: "媒體報導", href: "/#news", internal: false },
  ];
  const menuItems = cmsMenuItems?.length ? cmsMenuItems : fallbackMenuItems;

  useEffect(() => {
    let isCurrent = true;

    fetchSiteGlobalContent()
      .then((content) => {
        if (!isCurrent) return;
        const navigation = content.sections["global.navigation"]?.content;
        const nextItems = asArray<Record<string, unknown>>(navigation?.items)
          .filter((item) => asBoolean(item.is_visible, true))
          .map((item) => {
            const href = asString(item.href, "/");
            return {
              label: asString(item.label, ""),
              href,
              internal: typeof item.internal === "boolean" ? item.internal : href.startsWith("/"),
              sort_order: Number(item.sort_order || 0),
            };
          })
          .filter((item) => item.label && item.href)
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .slice(0, 12);
        setCmsMenuItems(nextItems.length ? nextItems : null);
      })
      .catch(() => {
        if (isCurrent) setCmsMenuItems(null);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const languages = ["繁體中文", "日本語", "韓語", "English"];
  const isShopPage = location === "/shop" || location.startsWith("/shop/");
  const isAccountPage = location.startsWith("/account");
  const isLegalPage = ["/privacy", "/terms", "/data-deletion"].includes(
    location
  );
  const useDarkControls = isScrolled || isShopPage || isLegalPage || isAccountPage;
  const authLinkClass = cn(
    "inline-flex h-9 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors",
    useDarkControls
      ? "text-[#8b6f5b] hover:bg-[#f3eadf]"
      : "text-white hover:bg-white/15"
  );
  const registerLinkClass = cn(
    "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors",
    useDarkControls
      ? "bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
      : "bg-white/90 text-[#8b6f5b] hover:bg-white"
  );
  const hamburgerLineClass = cn(
    "block h-[1.5px] w-6 rounded-full transition-colors duration-200",
    useDarkControls
      ? "bg-[#8b6f5b]/90 group-hover:bg-[#C58A54] group-active:bg-[#C58A54]"
      : "bg-[rgba(255,255,255,0.88)] group-hover:bg-[#C58A54] group-active:bg-[#C58A54]"
  );
  const menuLinkClass =
    "font-serif text-[24px] font-normal leading-none tracking-[0.08em] text-[#3D332B] transition duration-[230ms] ease-out hover:translate-x-1 hover:text-[#C58A54] motion-safe:animate-[mumbao-menu-item-in_300ms_ease-out_both] md:text-[28px]";
  const memberLinkClass =
    "inline-flex items-center gap-2.5 text-left font-serif text-[18px] font-normal leading-none tracking-[0.06em] text-[rgba(61,51,43,0.78)] transition duration-[230ms] ease-out hover:translate-x-1 hover:text-[#C58A54] md:text-[20px]";

  const isMenuItemActive = (item: MenuItem) => {
    if (!item.internal) return false;
    const path = item.href.split("#")[0];
    if (!path || path === "/") return location === path;
    return location === path || location.startsWith(`${path}/`);
  };

  const handleCustomerSignOut = async () => {
    await signOut();
    setLocation("/shop");
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out",
        isScrolled
          ? "bg-white/90 backdrop-blur-md py-4 shadow-sm"
          : "bg-transparent py-6"
      )}
    >
      <div className="container mx-auto px-4 md:px-8 flex items-center justify-between">
        {/* Left: Menu + Menu Image */}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="開啟導覽選單"
              className={cn(
                "group flex min-h-11 items-center gap-4 bg-transparent p-0 transition-opacity duration-200",
                isMenuOpen && "pointer-events-none opacity-0"
              )}
            >
              <span className="flex h-11 w-11 flex-col items-center justify-center gap-[5.5px] rounded-full">
                <span className={hamburgerLineClass} />
                <span className={hamburgerLineClass} />
                <span className={hamburgerLineClass} />
              </span>
              <img
                src="/images/menu.webp"
                alt="Menu"
                className="h-12 md:h-16 object-contain"
              />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            overlayClassName="!bg-[rgba(28,22,18,0.48)] backdrop-blur-[2px] data-[state=open]:duration-[260ms] data-[state=closed]:duration-[240ms]"
            className="!w-[84vw] !max-w-[420px] gap-0 border-r border-[rgba(120,95,70,0.12)] !bg-[rgba(248,243,235,0.92)] p-0 !shadow-[18px_0_60px_rgba(60,45,32,0.16)] backdrop-blur-[18px] data-[state=open]:duration-[300ms] data-[state=closed]:duration-[260ms] sm:!w-[360px] sm:!max-w-[420px] md:!w-[400px] lg:!w-[420px]"
          >
            <SheetTitle asChild>
              <VisuallyHidden>Navigation Menu</VisuallyHidden>
            </SheetTitle>
            <SheetClose
              aria-label="關閉導覽選單"
              className="group absolute right-5 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(120,95,70,0.18)] bg-[rgba(255,250,242,0.72)] text-[#3D332B] transition duration-200 hover:bg-[#fff0df] hover:text-[#C58A54]"
            >
              <X className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90" />
            </SheetClose>
            <div className="flex h-full flex-col px-8 pb-10 pt-24 sm:px-12 sm:pt-28 md:px-14 md:pt-[116px]">
              <nav className="flex flex-1 flex-col">
                <div className="flex flex-col gap-8">
                  {menuItems.map((item, index) => {
                    const className = cn(
                      menuLinkClass,
                      isMenuItemActive(item) && "!text-[#B77C4B]"
                    );

                    return (
                      <SheetClose asChild key={item.label}>
                        {item.internal ? (
                          <Link
                            href={item.href}
                            className={className}
                            style={{ animationDelay: `${80 + index * 30}ms` }}
                          >
                            {item.label}
                          </Link>
                        ) : (
                          <a
                            href={item.href}
                            className={className}
                            style={{ animationDelay: `${80 + index * 30}ms` }}
                          >
                            {item.label}
                          </a>
                        )}
                      </SheetClose>
                    );
                  })}
                </div>
                <div className="mt-10 border-t border-[rgba(120,95,70,0.16)] pt-7">
                  {isLoading ? (
                    <p className="text-sm text-[rgba(61,51,43,0.58)]">會員狀態確認中...</p>
                  ) : isAuthenticated ? (
                    <div className="flex flex-col gap-5">
                      <SheetClose asChild>
                        <Link
                          href="/account"
                          className={memberLinkClass}
                        >
                          <UserRound className="h-4 w-4" />
                          會員中心
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          className={memberLinkClass}
                          type="button"
                          onClick={() => void handleCustomerSignOut()}
                        >
                          <LogOut className="h-4 w-4" />
                          登出
                        </button>
                      </SheetClose>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      <SheetClose asChild>
                        <Link
                          href="/account/login"
                          className={memberLinkClass}
                        >
                          登入
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link
                          href="/account/register"
                          className={memberLinkClass}
                        >
                          註冊
                        </Link>
                      </SheetClose>
                    </div>
                  )}
                </div>
              </nav>
            </div>
          </SheetContent>
        </Sheet>

        {/* Center: Logo */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
          onClick={handleLogoClick}
        >
          <img
            src="/images/logo.webp"
            alt="STime Villa Logo"
            className="h-12 md:h-20 lg:h-24 object-contain group-hover:opacity-80 transition-opacity"
          />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden items-center gap-2 md:flex">
            {!isLoading &&
              (isAuthenticated ? (
                <>
                  <Link
                    href="/account"
                    className={authLinkClass}
                    title={user?.email || "會員中心"}
                  >
                    <UserRound className="mr-1 h-4 w-4" />
                    會員中心
                  </Link>
                  <button
                    className={authLinkClass}
                    type="button"
                    onClick={() => void handleCustomerSignOut()}
                  >
                    登出
                  </button>
                </>
              ) : (
                <>
                  <Link href="/account/login" className={authLinkClass}>
                    登入
                  </Link>
                  <Link href="/account/register" className={registerLinkClass}>
                    註冊
                  </Link>
                </>
              ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium tracking-wider cursor-pointer transition-colors",
                  useDarkControls
                    ? "text-[#8b6f5b] hover:bg-[#f3eadf]"
                    : "text-white hover:bg-white/15"
                )}
              >
                <Globe className="w-4 h-4 mr-1" />
                <span>TW</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-xl border-none shadow-lg min-w-[150px]">
              {languages.map((lang) => (
                <DropdownMenuItem
                  key={lang}
                  className="font-serif text-primary hover:text-[#E8A0BF] hover:bg-black/5 cursor-pointer py-3 px-4 text-sm tracking-wide"
                >
                  {lang}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
