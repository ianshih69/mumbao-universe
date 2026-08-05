import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  Gem,
  Home,
  KeyRound,
  LogOut,
  Menu,
  MessageCircle,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  UsersRound,
  Warehouse,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clearAdminToken,
  getAdminIdentity,
  getAdminToken,
  type AdminIdentity,
} from "@/lib/shop/adminAuth";
import {
  adminNavigationSections,
  adminSidebarExpandedSectionsStorageKey,
  canViewAdminNavItem,
  getAdminPageTitle,
  getVisibleAdminNavigation,
  isAdminNavItemActive,
  parseStoredAdminExpandedSections,
  resolveAdminExpandedSections,
  type AdminNavItem,
} from "@/components/admin/adminNavigation";

type AdminLayoutProps = {
  children: ReactNode;
  title?: string;
  contentClassName?: string;
};

const iconByKey: Record<string, typeof Home> = {
  overview: Home,
  bookings: CalendarDays,
  site: FileText,
  chats: MessageCircle,
  shop: ShoppingBag,
  products: Boxes,
  orders: ClipboardList,
  inventory: PackageCheck,
  scan: ScanLine,
  pos: ShoppingBag,
  warehouse: Warehouse,
  members: UsersRound,
  redemptions: Gem,
  users: UserCog,
  account: KeyRound,
  audit: ShieldCheck,
};

function buildLoginRedirect(pathname: string) {
  const currentPath =
    typeof window === "undefined"
      ? pathname
      : `${window.location.pathname}${window.location.search}`;
  return `/admin/shop/login?redirect=${encodeURIComponent(currentPath || "/admin")}`;
}

function AdminNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: AdminNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = iconByKey[item.key] || Home;
  const active = isAdminNavItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-[#8b6f5b] text-white shadow-sm"
          : "text-stone-600 hover:bg-[#f6efe6] hover:text-stone-900"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );
}

function readStoredExpandedSections() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    return parseStoredAdminExpandedSections(
      window.sessionStorage.getItem(adminSidebarExpandedSectionsStorageKey)
    );
  } catch {
    return new Set<string>();
  }
}

function saveStoredExpandedSections(sections: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      adminSidebarExpandedSectionsStorageKey,
      JSON.stringify(Array.from(sections))
    );
  } catch {
    // Storage can be unavailable in private or restricted browser modes.
  }
}

function AdminSidebar({
  identity,
  pathname,
  onNavigate,
}: {
  identity: AdminIdentity | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  const sections = getVisibleAdminNavigation(identity);
  const [manualExpandedSections, setManualExpandedSections] = useState(
    readStoredExpandedSections
  );
  const expandedSections = useMemo(
    () =>
      resolveAdminExpandedSections({
        storedSections: manualExpandedSections,
        pathname,
      }),
    [manualExpandedSections, pathname]
  );
  const overviewSection = sections.find((section) => section.label === "總覽");
  const collapsibleSections = sections.filter((section) => section.label !== "總覽");

  const toggleSection = (label: string) => {
    setManualExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      saveStoredExpandedSections(next);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-[#fbf7f1] text-stone-900">
      <div className="border-b border-[#eadfce] px-5 py-5">
        <p className="text-xs font-semibold tracking-[0.22em] text-[#9f7868]">
          STIME VILLA
        </p>
        <h1 className="mt-2 text-lg font-semibold">管理後台</h1>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {overviewSection?.items.map((item) => (
          <AdminNavLink
            key={item.key}
            item={item}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}

        {collapsibleSections.map((section) => {
          const isExpanded = expandedSections.has(section.label);
          const hasActiveItem = section.items.some((item) =>
            isAdminNavItemActive(pathname, item)
          );
          const Arrow = isExpanded ? ChevronDown : ChevronRight;

          return (
            <section key={section.label} className="space-y-1.5">
              <button
                type="button"
                className={cn(
                  "flex min-h-9 w-full items-center justify-between rounded-[8px] px-2 text-left text-xs font-semibold transition",
                  hasActiveItem
                    ? "text-[#7d604b]"
                    : "text-stone-400 hover:bg-[#f6efe6] hover:text-stone-600"
                )}
                aria-expanded={isExpanded}
                onClick={() => toggleSection(section.label)}
              >
                <span>{section.label}</span>
                <Arrow className="h-4 w-4 text-stone-400" />
              </button>

              {isExpanded && (
                <div className="space-y-1 pl-2">
                  {section.items.map((item) => (
                    <AdminNavLink
                      key={item.key}
                      item={item}
                      pathname={pathname}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </nav>
    </div>
  );
}

export function adminRouteCanRender(pathname: string, identity: AdminIdentity | null) {
  if (!identity || identity.is_active === false) return false;
  if (pathname === "/admin/legacy-content") return true;
  const item = adminNavigationSections
    .flatMap((section) => section.items)
    .find((navItem) => isAdminNavItemActive(pathname, navItem));
  if (!item) return true;
  return canViewAdminNavItem(item, identity);
}

export default function AdminLayout({
  children,
  title,
  contentClassName,
}: AdminLayoutProps) {
  const [pathname, setLocation] = useLocation();
  const [identity, setIdentity] = useState<AdminIdentity | null>(() => getAdminIdentity());
  const [token, setToken] = useState(() => getAdminToken());
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pageTitle = title || getAdminPageTitle(pathname);
  const canRender = adminRouteCanRender(pathname, identity);

  useEffect(() => {
    const nextToken = getAdminToken();
    const nextIdentity = getAdminIdentity();
    if (!nextToken || !nextIdentity) {
      if (nextToken && !nextIdentity) clearAdminToken();
      setToken("");
      setIdentity(null);
      setLocation(buildLoginRedirect(pathname));
      return;
    }
    setToken(nextToken);
    setIdentity(nextIdentity);
  }, [pathname, setLocation]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileOpen(false);
    };
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isMobileOpen]);

  const displayName = identity?.display_name || identity?.email || "管理員";
  const roleName = identity?.role_name || identity?.role_code || "";
  const previewHref = useMemo(() => {
    if (pathname.includes("/shop")) return "/shop";
    if (pathname.includes("/booking")) return "/booking";
    return "/";
  }, [pathname]);

  const logout = () => {
    clearAdminToken();
    setIdentity(null);
    setToken("");
    setIsMobileOpen(false);
    setLocation("/admin/shop/login");
  };

  if (!token) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f1e9] px-5 text-stone-600">
        <p className="text-sm">正在前往管理員登入...</p>
      </main>
    );
  }

  if (!canRender) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f1e9] px-5 text-stone-900">
        <section className="w-full max-w-md rounded-[8px] border border-stone-200 bg-white p-7 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-9 w-9 text-[#8b6f5b]" />
          <h1 className="mt-4 text-xl font-semibold">沒有此管理頁面權限</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            請使用具備對應權限的管理員帳號，或返回管理總覽。
          </p>
          <Link
            href="/admin"
            className="mt-5 inline-flex h-10 items-center rounded-full bg-[#8b6f5b] px-5 text-sm font-semibold text-white hover:bg-[#765d4a]"
          >
            返回管理總覽
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-[100svh] bg-[#f7f1e9] text-stone-900">
      <div className="flex min-h-[100svh]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-[#eadfce] bg-[#fbf7f1] lg:block">
          <AdminSidebar identity={identity} pathname={pathname} />
        </aside>

        {isMobileOpen && (
          <div className="lg:hidden">
            <button
              type="button"
              aria-label="關閉管理選單"
              className="fixed inset-0 z-40 bg-stone-950/35"
              onClick={() => setIsMobileOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] border-r border-[#eadfce] shadow-2xl">
              <div className="flex h-14 items-center justify-between border-b border-[#eadfce] bg-[#fbf7f1] px-4">
                <p className="text-sm font-semibold">管理選單</p>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-stone-600"
                  onClick={() => setIsMobileOpen(false)}
                  aria-label="關閉"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <AdminSidebar
                identity={identity}
                pathname={pathname}
                onNavigate={() => setIsMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
          <header className="sticky top-0 z-20 border-b border-[#eadfce] bg-white/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex min-h-12 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 lg:hidden"
                  aria-label="開啟管理選單"
                  onClick={() => setIsMobileOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-stone-900 md:text-xl">
                    {pageTitle}
                  </h2>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={previewHref}
                  className="hidden h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 sm:inline-flex"
                >
                  <ExternalLink className="h-4 w-4" />
                  前台預覽
                </Link>
                <div className="hidden min-w-0 text-right md:block">
                  <p className="max-w-[220px] truncate text-sm font-semibold text-stone-800">
                    {displayName}
                  </p>
                  {roleName && <p className="text-xs text-stone-400">{roleName}</p>}
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 md:px-4"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">登出</span>
                </button>
              </div>
            </div>
          </header>

          <div className={cn("min-w-0 flex-1", contentClassName)}>{children}</div>
        </div>
      </div>
    </div>
  );
}
