import { FormEvent, useEffect, useState } from "react";
import {
  Boxes,
  ClipboardList,
  LogOut,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  type AdminAuthStatus,
  adminAuthExpiredMessage,
  clearAdminToken,
  getInitialAdminAuthStatus,
  getAdminToken,
  setAdminToken,
} from "@/lib/shop/adminAuth";

const entryCards = [
  {
    title: "商品管理",
    description: "新增商品、調整價格、庫存、圖片與上架狀態。",
    href: "/admin/shop/products",
    icon: Boxes,
  },
  {
    title: "訂單管理",
    description: "查看官網訂單與現場銷售訂單，更新付款與訂單狀態。",
    href: "/admin/shop/orders",
    icon: ClipboardList,
  },
  {
    title: "庫存調整",
    description: "手動入庫、扣庫存、盤點調整，並查看庫存流水。",
    href: "/admin/shop/inventory",
    icon: PackageCheck,
  },
  {
    title: "掃描入庫",
    description: "用手機掃商品 QR code，確認後快速增加庫存。",
    href: "/admin/shop/scan",
    icon: ScanLine,
  },
  {
    title: "現場銷售 POS",
    description: "掃 QR 或手動 key 單，完成現場銷售並扣庫存。",
    href: "/admin/shop/pos",
    icon: ShoppingBag,
  },
];

async function validateAdminToken(token: string) {
  const params = new URLSearchParams({
    action: "orders",
    limit: "1",
  });
  const response = await fetch(`/api/admin-shop?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "後台登入驗證失敗");
  }
}

export default function AdminShopHome() {
  const [token, setTokenState] = useState(() => getAdminToken());
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>(() =>
    getInitialAdminAuthStatus()
  );
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isChecking, setIsChecking] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;

    let isCurrent = true;
    setIsChecking(true);
    setAuthStatus("checking");
    validateAdminToken(token)
      .then(() => {
        if (!isCurrent) return;
        setAuthStatus("loggedIn");
        setLoginError("");
      })
      .catch(() => {
        if (!isCurrent) return;
        clearAdminToken();
        setTokenState("");
        setAuthStatus("loggedOut");
        setLoginError(adminAuthExpiredMessage);
      })
      .finally(() => {
        if (isCurrent) setIsChecking(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const nextToken = password.trim();

    if (!nextToken) {
      setLoginError("請輸入 ADMIN_PASSWORD");
      return;
    }

    setIsChecking(true);
    setAuthStatus("checking");
    try {
      await validateAdminToken(nextToken);
      setAdminToken(nextToken);
      setTokenState(nextToken);
      setAuthStatus("loggedIn");
      setPassword("");
      setLoginError("");
    } catch (error) {
      clearAdminToken();
      setAuthStatus("loggedOut");
      setLoginError(error instanceof Error ? error.message : adminAuthExpiredMessage);
    } finally {
      setIsChecking(false);
    }
  };

  const logout = () => {
    clearAdminToken();
    setTokenState("");
    setAuthStatus("loggedOut");
    setPassword("");
    setLoginError("");
  };

  if (!token && authStatus === "checking") {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f2ea] px-5 text-stone-500">
        <p className="text-sm">確認登入狀態中...</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f2ea] px-5 text-stone-900">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-[8px] border border-stone-200 bg-white p-7 shadow-xl shadow-stone-200/70"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#8b6f5b] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                MUMBAO Admin
              </p>
              <h1 className="text-2xl font-semibold">商城後台登入</h1>
            </div>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="請輸入 ADMIN_PASSWORD"
            className="h-11 rounded-[8px]"
            disabled={isChecking}
          />
          {loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}
          <Button
            type="submit"
            className="mt-5 h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
            disabled={isChecking}
          >
            {isChecking ? "登入確認中..." : "登入商城後台"}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-7 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              MUMBAO Shop Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              商城後台
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
              集中管理慢寶商品、訂單、庫存、入庫與現場銷售。所有商城後台頁面共用同一份登入狀態。
            </p>
            {isChecking && (
              <p className="mt-2 text-xs text-stone-400">確認登入狀態中...</p>
            )}
          </div>
          <Button variant="ghost" className="rounded-full" onClick={logout}>
            <LogOut className="h-4 w-4" />
            登出
          </Button>
        </div>
      </header>

      <AdminShopNav current="home" />

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-6 sm:grid-cols-2 lg:grid-cols-3 md:px-8 md:py-8">
        {entryCards.map((card) => {
          const Icon = card.icon;

          return (
            <a
              key={card.href}
              href={card.href}
              className="group rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b99aa2] hover:shadow-md"
            >
              <div className="flex size-11 items-center justify-center rounded-full bg-[#f4ece2] text-[#8b6f5b] group-hover:bg-[#8b6f5b] group-hover:text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-stone-900">{card.title}</h2>
              <p className="mt-2 min-h-[3rem] text-sm leading-6 text-stone-500">
                {card.description}
              </p>
              <span className="mt-5 inline-flex rounded-full bg-[#8b6f5b] px-4 py-2 text-sm font-medium text-white">
                進入管理
              </span>
            </a>
          );
        })}
      </section>
    </main>
  );
}
