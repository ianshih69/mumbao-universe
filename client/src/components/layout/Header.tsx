import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Globe, X, LogOut, UserRound } from "lucide-react";
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

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
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

  const menuItems = [
    { label: "關於我們", href: "/about", internal: true },
    { label: "最新消息", href: "/#news", internal: false },
    { label: "認識慢寶", href: `${localePrefix}/about-mumbao`, internal: true },
    { label: "房型介紹", href: "/#rooms", internal: false },
    { label: "線上訂房", href: "/#booking", internal: false },
    { label: "宇宙碎品", href: "/shop", internal: true },
    { label: "媒體報導", href: "/#news", internal: false },
  ];

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
        <Sheet>
          <SheetTrigger asChild>
            <div className="flex items-center gap-2 group cursor-pointer">
              <div
                className={cn(
                  "p-2 rounded-full transition-colors",
                  useDarkControls ? "hover:bg-[#f3eadf]" : "hover:bg-white/15"
                )}
              >
                <Menu
                  className={cn(
                    "w-6 h-6",
                    useDarkControls ? "text-[#8b6f5b]" : "text-white"
                  )}
                />
              </div>
              <img
                src="/images/menu.webp"
                alt="Menu"
                className="h-12 md:h-16 object-contain"
              />
            </div>
          </SheetTrigger>
          <SheetContent side="left" className="w-full md:w-[400px] bg-white/95 backdrop-blur-xl border-none p-0">
            <SheetTitle asChild>
              <VisuallyHidden>Navigation Menu</VisuallyHidden>
            </SheetTitle>
            <div className="flex flex-col h-full p-12">
              <div className="flex justify-end mb-12">
                <SheetClose className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X className="w-6 h-6 text-primary" />
                </SheetClose>
              </div>
              <nav className="flex flex-col gap-8">
                {menuItems.map((item) => {
                  const className =
                    "font-serif text-2xl md:text-3xl text-primary hover:text-[#E8A0BF] transition-colors tracking-wider";

                  return (
                    <SheetClose asChild key={item.label}>
                      {item.internal ? (
                        <Link href={item.href} className={className}>
                          {item.label}
                        </Link>
                      ) : (
                        <a href={item.href} className={className}>
                          {item.label}
                        </a>
                      )}
                    </SheetClose>
                  );
                })}
                <div className="mt-2 border-t border-[#eadfce] pt-8">
                  {isLoading ? (
                    <p className="text-sm text-stone-400">會員狀態確認中...</p>
                  ) : isAuthenticated ? (
                    <div className="flex flex-col gap-4">
                      <SheetClose asChild>
                        <Link
                          href="/account"
                          className="inline-flex items-center gap-2 font-serif text-2xl text-primary hover:text-[#E8A0BF]"
                        >
                          <UserRound className="h-5 w-5" />
                          會員中心
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          className="inline-flex items-center gap-2 text-left font-serif text-2xl text-primary hover:text-[#E8A0BF]"
                          type="button"
                          onClick={() => void handleCustomerSignOut()}
                        >
                          <LogOut className="h-5 w-5" />
                          登出
                        </button>
                      </SheetClose>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <SheetClose asChild>
                        <Link
                          href="/account/login"
                          className="font-serif text-2xl text-primary hover:text-[#E8A0BF]"
                        >
                          登入
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link
                          href="/account/register"
                          className="font-serif text-2xl text-primary hover:text-[#E8A0BF]"
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
