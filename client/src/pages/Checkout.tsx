import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowLeft, CreditCard, MapPin, MessageSquare, UserRound } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CartLineItem } from "@/components/shop/CartLineItem";
import { CheckoutSummary } from "@/components/shop/CheckoutSummary";
import { createShopOrder } from "@/lib/shop/api";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import {
  clearCartItems,
  readCartItems,
  removeCartItem,
  subscribeCart,
  updateCartItemQuantity,
} from "@/lib/shop/cartStore";
import type { CartItem, CheckoutCustomer } from "@/lib/shop/types";

const checkoutKeyStorageKey = "mumbao-shop-checkout-idempotency";
const orderLookupStoragePrefix = "mumbao-shop-order-lookup:";
const orderCompleteMetaStoragePrefix = "mumbao-shop-order-complete-meta:";

type StoredCheckoutKey = {
  fingerprint: string;
  key: string;
};

type CheckoutFormCustomer = CheckoutCustomer & {
  postalCode: string;
  city: string;
  district: string;
  detailAddress: string;
};

type CustomerFormKey = keyof CheckoutFormCustomer;

function getCartFingerprint(items: CartItem[]) {
  return items
    .map((item) => `${item.variantId}:${item.quantity}`)
    .sort()
    .join("|");
}

function createSecureCheckoutKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  throw new Error("瀏覽器無法建立安全結帳憑證，請更新瀏覽器後再試。");
}

function readStoredCheckoutKey() {
  try {
    const rawValue = sessionStorage.getItem(checkoutKeyStorageKey);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as Partial<StoredCheckoutKey>;
    if (typeof parsed.fingerprint !== "string" || typeof parsed.key !== "string") {
      return null;
    }
    return parsed as StoredCheckoutKey;
  } catch {
    return null;
  }
}

function writeStoredCheckoutKey(value: StoredCheckoutKey) {
  try {
    sessionStorage.setItem(checkoutKeyStorageKey, JSON.stringify(value));
  } catch {
    // Session storage can be unavailable in strict private modes; component memory still covers this tab.
  }
}

function clearStoredCheckoutKey() {
  try {
    sessionStorage.removeItem(checkoutKeyStorageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function saveOrderLookupToken(orderNumber: string, lookupToken: string) {
  try {
    sessionStorage.setItem(`${orderLookupStoragePrefix}${orderNumber}`, lookupToken);
  } catch {
    // If storage is unavailable, the completion page will show a clear fallback message.
  }
}

function saveOrderCompleteMeta(
  orderNumber: string,
  meta: {
    isMemberOrder: boolean;
    savedDefaultProfile: boolean;
    defaultProfileSaveFailed: boolean;
  },
) {
  try {
    sessionStorage.setItem(`${orderCompleteMetaStoragePrefix}${orderNumber}`, JSON.stringify(meta));
  } catch {
    // The completion page will still show the core order success state.
  }
}

function buildShippingAddress(customer: CheckoutFormCustomer) {
  return [
    customer.postalCode.trim(),
    customer.city.trim(),
    customer.district.trim(),
    customer.detailAddress.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasProfileCheckoutDefaults(profile: ReturnType<typeof useCustomerAuth>["profile"]) {
  if (!profile) return false;
  return Boolean(
    profile.name ||
      profile.phone ||
      profile.default_postal_code ||
      profile.default_city ||
      profile.default_district ||
      profile.default_address,
  );
}

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isProfileLoading, profile, profileError, session, updateProfile } = useCustomerAuth();
  const fallbackCheckoutKeyRef = useRef<StoredCheckoutKey | null>(null);
  const touchedFieldsRef = useRef<Set<CustomerFormKey>>(new Set());
  const [items, setItems] = useState<CartItem[]>(() => readCartItems());
  const [customer, setCustomer] = useState<CheckoutFormCustomer>({
    name: "",
    phone: "",
    email: "",
    address: "",
    postalCode: "",
    city: "",
    district: "",
    detailAddress: "",
  });
  const [saveAsDefaultProfile, setSaveAsDefaultProfile] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => subscribeCart(() => setItems(readCartItems())), []);

  useEffect(() => {
    const fingerprint = getCartFingerprint(items);
    const stored = readStoredCheckoutKey();
    if (stored && stored.fingerprint !== fingerprint) {
      clearStoredCheckoutKey();
    }
    if (
      fallbackCheckoutKeyRef.current &&
      fallbackCheckoutKeyRef.current.fingerprint !== fingerprint
    ) {
      fallbackCheckoutKeyRef.current = null;
    }
  }, [items]);

  useEffect(() => {
    if (!isAuthenticated || !profile) return;

    setCustomer((current) => ({
      ...current,
      name:
        !touchedFieldsRef.current.has("name") && !current.name.trim()
          ? profile.name || current.name
          : current.name,
      phone:
        !touchedFieldsRef.current.has("phone") && !current.phone.trim()
          ? profile.phone || current.phone
          : current.phone,
      email:
        !touchedFieldsRef.current.has("email") && !(current.email || "").trim()
          ? profile.email || current.email
          : current.email,
      postalCode:
        !touchedFieldsRef.current.has("postalCode") && !current.postalCode.trim()
          ? profile.default_postal_code || current.postalCode
          : current.postalCode,
      city:
        !touchedFieldsRef.current.has("city") && !current.city.trim()
          ? profile.default_city || current.city
          : current.city,
      district:
        !touchedFieldsRef.current.has("district") && !current.district.trim()
          ? profile.default_district || current.district
          : current.district,
      detailAddress:
        !touchedFieldsRef.current.has("detailAddress") && !current.detailAddress.trim()
          ? profile.default_address || current.detailAddress
          : current.detailAddress,
    }));
  }, [isAuthenticated, profile]);

  const updateCustomer = (key: CustomerFormKey, value: string) => {
    touchedFieldsRef.current.add(key);
    setCustomer((current) => ({ ...current, [key]: value }));
  };

  const getCheckoutIdempotencyKey = () => {
    const fingerprint = getCartFingerprint(items);
    const stored = readStoredCheckoutKey();
    if (stored?.fingerprint === fingerprint) {
      fallbackCheckoutKeyRef.current = stored;
      return stored.key;
    }

    if (fallbackCheckoutKeyRef.current?.fingerprint === fingerprint) {
      return fallbackCheckoutKeyRef.current.key;
    }

    const nextValue = {
      fingerprint,
      key: createSecureCheckoutKey(),
    };
    fallbackCheckoutKeyRef.current = nextValue;
    writeStoredCheckoutKey(nextValue);
    return nextValue.key;
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (items.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const checkoutIdempotencyKey = getCheckoutIdempotencyKey();
      const checkoutCustomer = {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: buildShippingAddress(customer),
      };
      const { order, lookupToken } = await createShopOrder({
        customer: checkoutCustomer,
        checkoutIdempotencyKey,
        customerAccessToken: session?.access_token || null,
        note,
        items: items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
      });

      let savedDefaultProfile = false;
      let defaultProfileSaveFailed = false;

      if (isAuthenticated && saveAsDefaultProfile) {
        try {
          await updateProfile({
            name: customer.name,
            phone: customer.phone,
            default_postal_code: customer.postalCode,
            default_city: customer.city,
            default_district: customer.district,
            default_address: customer.detailAddress,
          });
          savedDefaultProfile = true;
        } catch {
          defaultProfileSaveFailed = true;
        }
      }

      saveOrderLookupToken(order.order_number, lookupToken);
      saveOrderCompleteMeta(order.order_number, {
        isMemberOrder: Boolean(session?.access_token),
        savedDefaultProfile,
        defaultProfileSaveFailed,
      });
      clearCartItems();
      clearStoredCheckoutKey();
      fallbackCheckoutKeyRef.current = null;
      setLocation(`/order-complete/${encodeURIComponent(order.order_number)}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "訂單建立失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <Link
            href="/cart"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#eadfce] bg-[#fffdf8] px-4 text-sm font-medium text-[#8b6f5b] shadow-sm shadow-stone-200/50 transition hover:bg-[#f3eadf]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回購物車
          </Link>
          <p className="mt-6 text-sm uppercase tracking-[0.2em] text-[#9f7868]">
            Checkout
          </p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">
            結帳
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            登入會員後，本次訂單會自動保存到會員中心；不登入也可以繼續訪客結帳。
          </p>
        </div>

        {items.length === 0 ? (
          <section className="rounded-[8px] border border-dashed border-[#d7c6b5] bg-[#fffdf8] px-6 py-14 text-center">
            <h2 className="font-serif text-2xl text-stone-900">購物車內沒有商品</h2>
            <Button asChild className="mt-6 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
              <Link href="/shop">前往商城</Link>
            </Button>
          </section>
        ) : (
          <form onSubmit={submitOrder} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="space-y-6">
              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">收件資料</h2>
                    <p className="mt-1 text-xs text-stone-500">請填寫方便我們聯繫與出貨的資料。</p>
                  </div>
                </div>
                {isAuthenticated && (
                  <div className="mt-4 rounded-[8px] border border-[#eadfce] bg-white/75 px-4 py-3 text-sm leading-6 text-stone-600">
                    <p className="font-medium text-stone-800">
                      已登入會員，本次訂單會保存到會員中心。
                    </p>
                    {isProfileLoading ? (
                      <p className="mt-1 text-xs text-stone-500">正在讀取會員預設資料...</p>
                    ) : profileError ? (
                      <p className="mt-1 text-xs text-amber-700">
                        無法載入會員預設資料，仍可手動填寫完成結帳。
                      </p>
                    ) : hasProfileCheckoutDefaults(profile) ? (
                      <p className="mt-1 text-xs text-stone-500">
                        已為你帶入會員資料，可依本次收件需求修改。
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-stone-500">
                        你可以填寫本次收件資料，並選擇是否儲存為下次預設資料。
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">收件人姓名</span>
                    <Input
                      value={customer.name}
                      onChange={(event) => updateCustomer("name", event.target.value)}
                      required
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">聯絡電話</span>
                    <Input
                      value={customer.phone}
                      onChange={(event) => updateCustomer("phone", event.target.value)}
                      required
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600 md:col-span-2">
                    <span className="font-medium text-stone-900">Email</span>
                    <Input
                      type="email"
                      value={customer.email}
                      onChange={(event) => updateCustomer("email", event.target.value)}
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">配送地址</h2>
                    <p className="mt-1 text-xs text-stone-500">請填寫完整地址，方便後續安排出貨。</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">郵遞區號</span>
                    <Input
                      value={customer.postalCode}
                      onChange={(event) => updateCustomer("postalCode", event.target.value)}
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">縣市</span>
                    <Input
                      value={customer.city}
                      onChange={(event) => updateCustomer("city", event.target.value)}
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">區域</span>
                    <Input
                      value={customer.district}
                      onChange={(event) => updateCustomer("district", event.target.value)}
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600 md:col-span-3">
                    <span className="font-medium text-stone-900">詳細地址</span>
                    <Input
                      value={customer.detailAddress}
                      onChange={(event) => updateCustomer("detailAddress", event.target.value)}
                      required
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                </div>
                {isAuthenticated && (
                  <label className="mt-5 flex items-start gap-3 rounded-[8px] border border-[#eadfce] bg-white/75 px-4 py-3 text-sm leading-6 text-stone-600">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-[#d7c6b5] text-[#8b6f5b]"
                      checked={saveAsDefaultProfile}
                      onChange={(event) => setSaveAsDefaultProfile(event.target.checked)}
                    />
                    <span>
                      <span className="block font-medium text-stone-800">
                        將本次收件資料儲存為我的預設收件資料
                      </span>
                      <span className="block text-xs text-stone-500">
                        只會在訂單成立後更新會員資料；不勾選也可以正常結帳。
                      </span>
                    </span>
                  </label>
                )}
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">備註</h2>
                    <p className="mt-1 text-xs text-stone-500">有希望我們留意的事項，可以在這裡補充。</p>
                  </div>
                </div>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-5 min-h-24 rounded-[8px] border-[#eadfce] bg-white"
                />
              </div>

              <div className="space-y-3">
                <h2 className="font-serif text-2xl text-stone-900">訂單商品</h2>
                {items.map((item) => (
                  <CartLineItem
                    key={item.variantId}
                    item={item}
                    onQuantityChange={(quantity) =>
                      updateCartItemQuantity(item.variantId, quantity)
                    }
                    onRemove={() => removeCartItem(item.variantId)}
                  />
                ))}
              </div>
            </section>

            <div className="space-y-4">
              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 text-sm leading-7 text-stone-600 shadow-sm shadow-stone-200/60">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">付款方式</h2>
                    <p className="mt-2 font-semibold text-stone-800">人工確認付款</p>
                    <p className="mt-1">
                      送出訂單後，我們會與您確認付款與出貨資訊。訂單完成頁會提供安全查詢連結，請妥善保存。
                    </p>
                  </div>
                </div>
              </div>
              {error && (
                <div className="flex gap-3 rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                  <span>{error}</span>
                </div>
              )}
              <CheckoutSummary
                items={items}
                actionLabel={isSubmitting ? "正在建立訂單..." : "送出訂單"}
                disabled={isSubmitting}
                onAction={() => {
                  const submitButton = document.getElementById("checkout-submit");
                  submitButton?.click();
                }}
              />
              <button id="checkout-submit" type="submit" className="hidden" />
            </div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
