export type AdminProductStatus = "draft" | "published" | "archived";
export type AdminVariantStatus = "active" | "inactive";

const adminAuthExpiredMessage = "登入已過期，請重新登入";

export type AdminShopProductSummary = {
  id: string;
  slug: string;
  name: string;
  subtitle?: string;
  description?: string;
  category: string;
  status: AdminProductStatus;
  featured: boolean;
  sort_order: number;
  cover_image_url?: string;
  min_price: number;
  total_inventory: number;
  variant_count: number;
  image_count: number;
  created_at?: string;
  updated_at?: string;
};

export type AdminShopVariant = {
  id: string;
  product_id: string;
  sku?: string;
  variant_name: string;
  variant_option?: string;
  price: number;
  compare_at_price?: number | null;
  inventory: number;
  status: AdminVariantStatus;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type AdminShopImage = {
  id: string;
  product_id: string;
  image_url: string;
  alt?: string;
  sort_order: number;
  created_at?: string;
};

export type AdminShopProductDetail = AdminShopProductSummary & {
  variants: AdminShopVariant[];
  images: AdminShopImage[];
};

export type AdminShopProductInput = Pick<
  AdminShopProductDetail,
  | "name"
  | "slug"
  | "subtitle"
  | "description"
  | "category"
  | "status"
  | "featured"
  | "sort_order"
  | "cover_image_url"
> & {
  id?: string;
};

export type AdminShopVariantInput = Omit<
  AdminShopVariant,
  "id" | "product_id" | "created_at" | "updated_at"
> & {
  id?: string;
  product_id?: string;
};

export type AdminShopImageInput = Omit<
  AdminShopImage,
  "id" | "product_id" | "created_at"
> & {
  id?: string;
  product_id?: string;
};

async function fetchAdminJson<T>(
  url: string,
  token: string,
  options: RequestInit = {}
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(adminAuthExpiredMessage);
    }

    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export async function fetchAdminShopProducts({
  token,
  q = "",
  status = "",
  page = 0,
  limit = 30,
}: {
  token: string;
  q?: string;
  status?: "" | AdminProductStatus;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams({
    action: "products",
    page: String(page),
    limit: String(limit),
  });

  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());

  return fetchAdminJson<{
    products?: AdminShopProductSummary[];
    page?: number;
    limit?: number;
    hasMore?: boolean;
    nextPage?: number | null;
  }>(`/api/admin-shop?${params.toString()}`, token);
}

export async function fetchAdminShopProduct(token: string, id: string) {
  const data = await fetchAdminJson<{ product?: AdminShopProductDetail }>(
    `/api/admin-shop?action=product&id=${encodeURIComponent(id)}`,
    token
  );

  if (!data.product) {
    throw new Error("找不到商品資料");
  }

  return data.product;
}

export async function updateAdminShopProduct({
  token,
  product,
  variants,
  images,
}: {
  token: string;
  product: Pick<
    AdminShopProductDetail,
    | "id"
    | "name"
    | "slug"
    | "subtitle"
    | "description"
    | "category"
    | "status"
    | "featured"
    | "sort_order"
    | "cover_image_url"
  >;
  variants: AdminShopVariant[];
  images: AdminShopImage[];
}) {
  const data = await fetchAdminJson<{ product?: AdminShopProductDetail }>(
    "/api/admin-shop?action=product",
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ product, variants, images }),
    }
  );

  if (!data.product) {
    throw new Error("商品更新失敗");
  }

  return data.product;
}

export async function createAdminShopProduct({
  token,
  product,
  variants,
  images,
}: {
  token: string;
  product: AdminShopProductInput;
  variants: AdminShopVariantInput[];
  images: AdminShopImageInput[];
}) {
  const data = await fetchAdminJson<{ product?: AdminShopProductDetail }>(
    "/api/admin-shop?action=product",
    token,
    {
      method: "POST",
      body: JSON.stringify({ product, variants, images }),
    }
  );

  if (!data.product) {
    throw new Error("??撱箇?憭望?");
  }

  return data.product;
}
