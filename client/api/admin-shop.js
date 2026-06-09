import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
  supabaseRpc,
} from "../server/shopShared.js";

const defaultLimit = 30;
const maxLimit = 50;
const exportLimit = 1000;
const validOrderStatuses = new Set([
  "pending_confirm",
  "pending_payment",
  "paid",
  "shipping",
  "completed",
  "cancelled",
]);
const validOrderSources = new Set(["online", "pos"]);
const validPaymentStatuses = new Set([
  "pending",
  "confirmed",
  "failed",
  "refunded",
]);
const validProductStatuses = new Set(["draft", "published", "archived"]);
const validVariantStatuses = new Set(["active", "inactive"]);
const validInventoryMovementTypes = new Set([
  "stock_in",
  "stock_out",
  "adjustment",
  "manual_sale",
  "online_order",
  "return_in",
]);
const knownInventoryErrors = new Map([
  ["VARIANT_ID_REQUIRED", "Variant id is required."],
  ["INVALID_MOVEMENT_TYPE", "Invalid inventory movement type."],
  ["INVALID_QUANTITY", "Inventory quantity is invalid."],
  ["VARIANT_NOT_FOUND", "Product variant not found."],
  ["INSUFFICIENT_INVENTORY", "Inventory cannot be less than 0."],
]);
const validPosPaymentMethods = new Set(["cash", "transfer", "other"]);
const knownManualSaleErrors = new Map([
  ["SALE_ITEMS_REQUIRED", "Sale items are required."],
  ["INVALID_PAYMENT_METHOD", "Invalid payment method."],
  ["INVALID_SALE_ITEM", "Sale item quantity is invalid."],
  ["VARIANT_NOT_FOUND", "Product variant not found or is not active."],
  ["PRODUCT_NOT_FOUND", "Product not found."],
  ["INSUFFICIENT_INVENTORY", "Inventory is not enough for this sale."],
]);

function requireAdmin(req) {
  const adminPassword = String(getServerEnv("ADMIN_PASSWORD") || "").trim();
  const authHeader = String(req.headers?.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const providedPassword =
    bearerToken || String(req.headers?.["x-admin-password"] || "").trim();

  if (!adminPassword) {
    const error = new Error("ADMIN_PASSWORD is not configured.");
    error.status = 500;
    throw error;
  }

  if (providedPassword !== adminPassword) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }
}

function createMetaStatus(status, accountName = null, error = null) {
  return {
    status,
    accountName,
    error,
  };
}

function getMetaGraphVersion() {
  const configuredVersion = String(
    getServerEnv("META_GRAPH_API_VERSION") || ""
  ).trim();

  return /^v\d+\.\d+$/.test(configuredVersion)
    ? configuredVersion
    : "v25.0";
}

function getSafeMetaErrorMessage(status, code) {
  if (code === 190 || status === 401) {
    return "存取權杖無效或已過期，請更新 Vercel Environment Variables。";
  }

  if (code === 10 || code === 200 || status === 403) {
    return "Meta 權限不足，請確認帳號權限與 App 權限設定。";
  }

  if (status === 404) {
    return "找不到指定的 Meta 帳號，請確認帳號 ID 是否正確。";
  }

  if (status === 429) {
    return "Meta API 請求過於頻繁，請稍後再試。";
  }

  return "無法連線 Meta 平台，請確認帳號、權杖與 App 設定。";
}

async function fetchMetaProfile({
  baseUrl,
  version,
  accountId,
  accessToken,
  fields,
}) {
  const url = new URL(
    `${baseUrl}/${version}/${encodeURIComponent(accountId)}`
  );
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("access_token", accessToken);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return createMetaStatus(
      "error",
      null,
      "目前無法連線 Meta API，請稍後再試。"
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return createMetaStatus(
      "error",
      null,
      getSafeMetaErrorMessage(response.status, Number(payload?.error?.code || 0))
    );
  }

  const accountName = cleanText(payload?.name || payload?.username);
  return createMetaStatus(
    "connected",
    accountName || "帳號已連線",
    null
  );
}

async function checkFacebookConnection() {
  const pageId = cleanText(getServerEnv("FACEBOOK_PAGE_ID"));
  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );

  if (!pageId || !accessToken) {
    return createMetaStatus("not_configured");
  }

  return fetchMetaProfile({
    baseUrl: "https://graph.facebook.com",
    version: getMetaGraphVersion(),
    accountId: pageId,
    accessToken,
    fields: ["id", "name"],
  });
}

async function checkInstagramConnection() {
  const accountId = cleanText(
    getServerEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID")
  );
  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );

  if (!accountId || !accessToken) {
    return createMetaStatus("not_configured");
  }

  return fetchMetaProfile({
    baseUrl: "https://graph.facebook.com",
    version: getMetaGraphVersion(),
    accountId,
    accessToken,
    fields: ["id", "username", "name"],
  });
}

async function checkThreadsConnection() {
  const userId = cleanText(getServerEnv("THREADS_USER_ID"));
  const accessToken = cleanText(getServerEnv("THREADS_ACCESS_TOKEN"));

  if (!userId || !accessToken) {
    return createMetaStatus("not_configured");
  }

  return fetchMetaProfile({
    baseUrl: "https://graph.threads.net",
    version: "v1.0",
    accountId: userId,
    accessToken,
    fields: ["id", "username", "name"],
  });
}

async function loadMetaStatus(_req, res) {
  const [facebook, instagram, threads] = await Promise.all([
    checkFacebookConnection(),
    checkInstagramConnection(),
    checkThreadsConnection(),
  ]);

  return sendJson(res, 200, {
    platforms: {
      facebook,
      instagram,
      threads,
    },
    checkedAt: new Date().toISOString(),
  });
}

function getPositiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maxValue);
}

function getPage(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function getInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function getRequiredInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${fieldName} must be a number.`);
    error.status = 400;
    throw error;
  }

  return parsed;
}

function nullableText(value) {
  const text = cleanText(value);
  return text ? text : null;
}

function getNextDateString(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1)
  );

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function getKnownInventoryErrorMessage(error) {
  const message = String(error?.details?.message || error?.message || "");
  const matchedKey = Array.from(knownInventoryErrors.keys()).find((key) =>
    message.includes(key)
  );

  return matchedKey ? knownInventoryErrors.get(matchedKey) : "";
}

function getKnownManualSaleErrorMessage(error) {
  const message = String(error?.details?.message || error?.message || "");
  const matchedKey = Array.from(knownManualSaleErrors.keys()).find((key) =>
    message.includes(key)
  );

  return matchedKey ? knownManualSaleErrors.get(matchedKey) : "";
}

function normalizeOrderSummary(order) {
  return {
    id: order.id,
    order_number: order.order_number || "",
    customer_name: order.customer_name || "",
    customer_phone: order.customer_phone || "",
    customer_email: order.customer_email || "",
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    payment_method: order.payment_method || "manual_confirmation",
    payment_status: order.payment_status || "pending",
    order_status: order.order_status || "pending_confirm",
    order_source: order.order_source || "online",
    shipping_address: order.shipping_address || "",
    shipping_carrier: order.shipping_carrier || "",
    tracking_number: order.tracking_number || "",
    note: order.note || "",
    internal_note: order.internal_note || "",
    created_at: order.created_at || "",
    updated_at: order.updated_at || "",
  };
}

function buildOrderItemsSummary(items = []) {
  if (!items.length) {
    return {
      items_summary: "尚無商品明細",
      item_count: 0,
    };
  }

  if (items.length === 1) {
    const item = items[0];
    return {
      items_summary: `${item.product_name || "未命名商品"} ×${Number(item.quantity || 0)}`,
      item_count: 1,
    };
  }

  return {
    items_summary: `共 ${items.length} 項商品`,
    item_count: items.length,
  };
}

function normalizeDashboardOrderSummary(order, itemsByOrderId = new Map()) {
  const items = itemsByOrderId.get(order.id) || [];

  return {
    ...normalizeOrderSummary(order),
    ...buildOrderItemsSummary(items),
  };
}

function normalizeOrder(order, items = []) {
  return {
    ...normalizeOrderSummary(order),
    shipping_address: order.shipping_address || "",
    note: order.note || "",
    shipping_carrier: order.shipping_carrier || "",
    tracking_number: order.tracking_number || "",
    internal_note: order.internal_note || "",
    items: items.map(normalizeItem),
  };
}

function normalizeItem(item) {
  return {
    id: item.id,
    order_id: item.order_id,
    product_id: item.product_id || "",
    variant_id: item.variant_id || "",
    product_name: item.product_name || "",
    product_slug: item.product_slug || "",
    product_image_url: item.product_image_url || "",
    variant_name: item.variant_name || "",
    variant_option: item.variant_option || "",
    variant_price: Number(item.variant_price || 0),
    unit_price: Number(item.unit_price || 0),
    quantity: Number(item.quantity || 0),
    line_total: Number(item.line_total || 0),
    created_at: item.created_at || "",
  };
}

function normalizeVariant(variant) {
  return {
    id: variant.id,
    product_id: variant.product_id,
    sku: variant.sku || "",
    variant_name: variant.variant_name || "",
    variant_option: variant.variant_option || "",
    image_url: variant.image_url || null,
    price: Number(variant.price || 0),
    compare_at_price:
      variant.compare_at_price === null || variant.compare_at_price === undefined
        ? null
        : Number(variant.compare_at_price),
    inventory: Number(variant.inventory || 0),
    status: variant.status || "active",
    sort_order: Number(variant.sort_order || 0),
    created_at: variant.created_at || "",
    updated_at: variant.updated_at || "",
  };
}

function normalizeImage(image) {
  return {
    id: image.id,
    product_id: image.product_id,
    image_url: image.image_url || "",
    alt: image.alt || "",
    sort_order: Number(image.sort_order || 0),
    created_at: image.created_at || "",
  };
}

function getProductStats(productId, variantsByProductId, imagesByProductId) {
  const variants = variantsByProductId.get(productId) || [];
  const images = imagesByProductId.get(productId) || [];
  const activePrices = variants
    .filter((variant) => variant.status === "active")
    .map((variant) => Number(variant.price || 0));
  const allPrices = variants.map((variant) => Number(variant.price || 0));
  const prices = activePrices.length ? activePrices : allPrices;

  return {
    min_price: prices.length ? Math.min(...prices) : 0,
    total_inventory: variants.reduce(
      (total, variant) => total + Number(variant.inventory || 0),
      0
    ),
    variant_count: variants.length,
    image_count: images.length,
  };
}

function normalizeProductSummary(product, variantsByProductId, imagesByProductId) {
  return {
    id: product.id,
    slug: product.slug || "",
    name: product.name || "",
    subtitle: product.subtitle || "",
    description: product.description || "",
    category: product.category || "",
    status: product.status || "draft",
    featured: Boolean(product.featured),
    sort_order: Number(product.sort_order || 0),
    cover_image_url: product.cover_image_url || "",
    created_at: product.created_at || "",
    updated_at: product.updated_at || "",
    ...getProductStats(product.id, variantsByProductId, imagesByProductId),
  };
}

function normalizeProduct(product, variants = [], images = []) {
  const variantsByProductId = new Map([[product.id, variants.map(normalizeVariant)]]);
  const imagesByProductId = new Map([[product.id, images.map(normalizeImage)]]);

  return {
    ...normalizeProductSummary(product, variantsByProductId, imagesByProductId),
    variants: variantsByProductId.get(product.id) || [],
    images: imagesByProductId.get(product.id) || [],
  };
}

function normalizeInventoryMovement(
  movement,
  productsById = new Map(),
  variantsById = new Map()
) {
  const product = productsById.get(movement.product_id);
  const variant = variantsById.get(movement.variant_id);

  return {
    id: movement.id,
    product_id: movement.product_id || "",
    variant_id: movement.variant_id || "",
    product_name: product?.name || "",
    product_slug: product?.slug || "",
    variant_name: variant?.variant_name || "",
    variant_option: variant?.variant_option || "",
    sku: variant?.sku || "",
    movement_type: movement.movement_type || "adjustment",
    quantity_delta: Number(movement.quantity_delta || 0),
    quantity_before: Number(movement.quantity_before || 0),
    quantity_after: Number(movement.quantity_after || 0),
    reference_type: movement.reference_type || "",
    reference_number: movement.reference_number || "",
    note: movement.note || "",
    created_at: movement.created_at || "",
    created_by: movement.created_by || "",
  };
}

function normalizeInventoryLookup(product, variant) {
  return {
    product: {
      id: product.id,
      slug: product.slug || "",
      name: product.name || "",
      category: product.category || "",
      status: product.status || "draft",
      cover_image_url: product.cover_image_url || "",
    },
    variant: normalizeVariant(variant),
    inventory: Number(variant.inventory || 0),
  };
}

function normalizeInventorySearchItem(product, variant) {
  return {
    product: {
      id: product.id,
      slug: product.slug || "",
      name: product.name || "",
      category: product.category || "",
      status: product.status || "draft",
      cover_image_url: product.cover_image_url || "",
    },
    variant: normalizeVariant(variant),
    inventory: Number(variant.inventory || 0),
  };
}

function getTaipeiTodayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1);
  const day = Number(parts.find((part) => part.type === "day")?.value || 1);
  const taipeiOffsetMs = 8 * 60 * 60 * 1000;
  const startMs = Date.UTC(year, month - 1, day) - taipeiOffsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000;

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function isPaidOrCompletedOrder(order) {
  return order.payment_status === "confirmed" || order.order_status === "completed";
}

function getOrderSource(order) {
  return order.order_source === "pos" ? "pos" : "online";
}

function summarizeTodayOrders(orders = []) {
  const salesOrders = orders.filter(isPaidOrCompletedOrder);
  const totalBySource = (source) =>
    salesOrders
      .filter((order) => getOrderSource(order) === source)
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const countBySource = (source) =>
    orders.filter((order) => getOrderSource(order) === source).length;

  return {
    sales_total: salesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    online_sales_total: totalBySource("online"),
    pos_sales_total: totalBySource("pos"),
    order_count: orders.length,
    online_order_count: countBySource("online"),
    pos_order_count: countBySource("pos"),
  };
}

async function loadProductsByIds(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const productsById = new Map();

  if (!ids.length) return productsById;

  const products = await supabaseRequest(
    `/shop_products?select=id,slug,name&id=in.(${ids.join(",")})`
  );

  for (const product of products || []) {
    productsById.set(product.id, product);
  }

  return productsById;
}

async function loadVariantsByIds(variantIds = []) {
  const ids = [...new Set(variantIds.filter(Boolean))];
  const variantsById = new Map();

  if (!ids.length) return variantsById;

  const variants = await supabaseRequest(
    `/shop_product_variants?select=id,product_id,sku,variant_name,variant_option&id=in.(${ids.join(",")})`
  );

  for (const variant of variants || []) {
    variantsById.set(variant.id, variant);
  }

  return variantsById;
}

function normalizeLowInventoryVariant(variant, productsById = new Map()) {
  const product = productsById.get(variant.product_id);

  return {
    product_id: variant.product_id || "",
    variant_id: variant.id || "",
    product_name: product?.name || "",
    variant_name: variant.variant_name || "",
    variant_option: variant.variant_option || "",
    sku: variant.sku || "",
    inventory: Number(variant.inventory || 0),
  };
}

async function loadDashboard(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { startIso, endIso } = getTaipeiTodayRange();
  const orderSelect =
    "id,order_number,customer_name,total,payment_status,order_status,order_source,created_at";
  const movementSelect =
    "id,product_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_number,note,created_at,created_by";
  const [
    todayOrders,
    pendingOnlineOrders,
    recentOrders,
    lowInventoryVariants,
    recentMovements,
  ] = await Promise.all([
    supabaseRequest(
      `/shop_orders?select=${orderSelect}&created_at=gte.${encodeURIComponent(
        startIso
      )}&created_at=lt.${encodeURIComponent(endIso)}&order=created_at.desc&limit=1000`
    ),
    supabaseRequest(
      "/shop_orders?select=id&order_source=eq.online&order_status=eq.pending_confirm&limit=1000"
    ),
    supabaseRequest(
      `/shop_orders?select=${orderSelect}&order=created_at.desc&limit=5`
    ),
    supabaseRequest(
      "/shop_product_variants?select=id,product_id,sku,variant_name,variant_option,inventory,status&inventory=lte.3&order=inventory.asc,updated_at.desc&limit=10"
    ),
    supabaseRequest(
      `/shop_inventory_movements?select=${movementSelect}&order=created_at.desc&limit=5`
    ),
  ]);

  const lowInventoryProductsById = await loadProductsByIds(
    (lowInventoryVariants || []).map((variant) => variant.product_id)
  );
  const movementProductsById = await loadProductsByIds(
    (recentMovements || []).map((movement) => movement.product_id)
  );
  const movementVariantsById = await loadVariantsByIds(
    (recentMovements || []).map((movement) => movement.variant_id)
  );
  const recentOrderIds = (recentOrders || []).map((order) => order.id).filter(Boolean);
  const recentOrderItems = recentOrderIds.length
    ? await supabaseRequest(
        `/shop_order_items?order_id=in.(${recentOrderIds.join(
          ","
        )})&select=order_id,product_name,quantity,created_at&order=created_at.asc`
      )
    : [];
  const recentOrderItemsByOrderId = new Map();

  for (const item of recentOrderItems || []) {
    const items = recentOrderItemsByOrderId.get(item.order_id) || [];
    items.push(item);
    recentOrderItemsByOrderId.set(item.order_id, items);
  }

  return sendJson(res, 200, {
    dashboard: {
      today: summarizeTodayOrders(todayOrders || []),
      pending_online_order_count: (pendingOnlineOrders || []).length,
      low_inventory: (lowInventoryVariants || []).map((variant) =>
        normalizeLowInventoryVariant(variant, lowInventoryProductsById)
      ),
      recent_orders: (recentOrders || []).map((order) =>
        normalizeDashboardOrderSummary(order, recentOrderItemsByOrderId)
      ),
      recent_movements: (recentMovements || []).map((movement) =>
        normalizeInventoryMovement(
          movement,
          movementProductsById,
          movementVariantsById
        )
      ),
    },
  });
}

function buildOrderListFilters(req) {
  const search = String(firstQueryValue(req.query?.q) || "").trim();
  const status = String(firstQueryValue(req.query?.status) || "").trim();
  const source = String(firstQueryValue(req.query?.source) || "").trim();
  const paymentStatus = String(firstQueryValue(req.query?.paymentStatus) || "").trim();
  const dateFrom = String(firstQueryValue(req.query?.dateFrom) || "").trim();
  const dateTo = String(firstQueryValue(req.query?.dateTo) || "").trim();
  const tracking = String(firstQueryValue(req.query?.tracking) || "").trim();
  const statusFilter =
    status && validOrderStatuses.has(status)
      ? `&order_status=eq.${encodeURIComponent(status)}`
      : "";
  const sourceFilter =
    source && validOrderSources.has(source)
      ? `&order_source=eq.${encodeURIComponent(source)}`
      : "";
  const paymentStatusFilter =
    paymentStatus && validPaymentStatuses.has(paymentStatus)
      ? `&payment_status=eq.${encodeURIComponent(paymentStatus)}`
      : "";
  const dateFromFilter = isDateString(dateFrom)
    ? `&created_at=gte.${encodeURIComponent(`${dateFrom}T00:00:00`)}`
    : "";
  const nextDateTo = getNextDateString(dateTo);
  const dateToFilter = nextDateTo
    ? `&created_at=lt.${encodeURIComponent(`${nextDateTo}T00:00:00`)}`
    : "";
  const trackingFilter =
    tracking === "with"
      ? "&tracking_number=not.is.null"
      : tracking === "without"
        ? "&tracking_number=is.null"
        : "";
  const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
  const searchFilter = search
    ? `&or=(order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_phone.ilike.${searchTerm},customer_email.ilike.${searchTerm},tracking_number.ilike.${searchTerm})`
    : "";

  return `${statusFilter}${sourceFilter}${paymentStatusFilter}${dateFromFilter}${dateToFilter}${trackingFilter}${searchFilter}`;
}

async function loadOrders(req, res) {
  const isExport = String(firstQueryValue(req.query?.export) || "").trim() === "1";
  const limit = isExport
    ? exportLimit
    : getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const page = isExport ? 0 : getPage(firstQueryValue(req.query?.page));
  const offset = page * limit;
  const select = isExport
    ? "id,order_number,customer_name,customer_phone,customer_email,shipping_address,subtotal,shipping_fee,total,payment_method,payment_status,order_status,order_source,shipping_carrier,tracking_number,note,internal_note,created_at,updated_at"
    : "id,order_number,customer_name,customer_phone,customer_email,subtotal,shipping_fee,total,payment_method,payment_status,order_status,order_source,tracking_number,created_at,updated_at";
  const orderFilters = buildOrderListFilters(req);
  const orders = await supabaseRequest(
    `/shop_orders?select=${select}${orderFilters}&order=created_at.desc&limit=${
      limit + 1
    }&offset=${offset}`
  );
  const hasMore = (orders || []).length > limit;
  const visibleOrders = (orders || []).slice(0, limit);
  const visibleOrderIds = visibleOrders.map((order) => order.id).filter(Boolean);
  const visibleOrderItems = visibleOrderIds.length
    ? await supabaseRequest(
        `/shop_order_items?order_id=in.(${visibleOrderIds.join(
          ","
        )})&select=order_id,product_name,quantity,created_at&order=created_at.asc`
      )
    : [];
  const visibleOrderItemsByOrderId = new Map();

  for (const item of visibleOrderItems || []) {
    const items = visibleOrderItemsByOrderId.get(item.order_id) || [];
    items.push(item);
    visibleOrderItemsByOrderId.set(item.order_id, items);
  }

  return sendJson(res, 200, {
    orders: visibleOrders.map((order) =>
      normalizeDashboardOrderSummary(order, visibleOrderItemsByOrderId)
    ),
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}

function normalizeOrderItemExportRow(order, item, variant) {
  return {
    order_number: order.order_number || "",
    created_at: order.created_at || "",
    order_source: order.order_source || "online",
    customer_name: order.customer_name || "",
    customer_phone: order.customer_phone || "",
    customer_email: order.customer_email || "",
    order_status: order.order_status || "pending_confirm",
    payment_status: order.payment_status || "pending",
    shipping_carrier: order.shipping_carrier || "",
    tracking_number: order.tracking_number || "",
    product_name: item.product_name || "",
    variant_name: item.variant_name || "",
    variant_option: item.variant_option || "",
    sku: variant?.sku || "",
    unit_price: Number(item.unit_price || 0),
    quantity: Number(item.quantity || 0),
    line_total: Number(item.line_total || 0),
    order_total: Number(order.total || 0),
    internal_note: order.internal_note || "",
  };
}

async function loadOrderItemsExport(req, res) {
  const select =
    "id,order_number,customer_name,customer_phone,customer_email,total,payment_status,order_status,order_source,shipping_carrier,tracking_number,internal_note,created_at";
  const orderFilters = buildOrderListFilters(req);
  const orders = await supabaseRequest(
    `/shop_orders?select=${select}${orderFilters}&order=created_at.desc&limit=${exportLimit}`
  );

  if (!orders?.length) {
    return sendJson(res, 200, { rows: [] });
  }

  const orderIds = orders.map((order) => order.id).filter(Boolean);
  const items = orderIds.length
    ? await supabaseRequest(
        `/shop_order_items?order_id=in.(${orderIds.join(
          ","
        )})&select=*&order=created_at.asc`
      )
    : [];
  const variantsById = await loadVariantsByIds((items || []).map((item) => item.variant_id));
  const itemsByOrderId = new Map();

  for (const item of items || []) {
    const orderItems = itemsByOrderId.get(item.order_id) || [];
    orderItems.push(item);
    itemsByOrderId.set(item.order_id, orderItems);
  }

  const rows = [];
  for (const order of orders || []) {
    const orderItems = itemsByOrderId.get(order.id) || [];
    for (const item of orderItems) {
      rows.push(
        normalizeOrderItemExportRow(
          order,
          item,
          variantsById.get(item.variant_id)
        )
      );
    }
  }

  return sendJson(res, 200, { rows });
}

async function loadOrder(orderNumber) {
  const orders = await supabaseRequest(
    `/shop_orders?order_number=eq.${encodeURIComponent(
      orderNumber
    )}&select=*&limit=1`
  );
  const order = orders?.[0];

  if (!order) {
    const error = new Error("Order not found.");
    error.status = 404;
    throw error;
  }

  const items = await supabaseRequest(
    `/shop_order_items?order_id=eq.${encodeURIComponent(
      order.id
    )}&select=*&order=created_at.asc`
  );

  return normalizeOrder(order, items || []);
}

function validateStatusPatch(body) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "order_status")) {
    const value = String(body.order_status || "").trim();
    if (!validOrderStatuses.has(value)) {
      const error = new Error("Invalid order_status.");
      error.status = 400;
      throw error;
    }
    patch.order_status = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "payment_status")) {
    const value = String(body.payment_status || "").trim();
    if (!validPaymentStatuses.has(value)) {
      const error = new Error("Invalid payment_status.");
      error.status = 400;
      throw error;
    }
    patch.payment_status = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "shipping_carrier")) {
    patch.shipping_carrier = nullableText(body.shipping_carrier);
  }

  if (Object.prototype.hasOwnProperty.call(body, "tracking_number")) {
    patch.tracking_number = nullableText(body.tracking_number);
  }

  if (Object.prototype.hasOwnProperty.call(body, "internal_note")) {
    patch.internal_note = nullableText(body.internal_note);
  }

  if (!Object.keys(patch).length) {
    const error = new Error("No fields to update.");
    error.status = 400;
    throw error;
  }

  return patch;
}

async function handleOrderAction(req, res) {
  if (req.method === "GET") {
    const orderNumber = String(firstQueryValue(req.query?.orderNumber) || "").trim();
    if (!orderNumber) {
      return sendJson(res, 400, { error: "orderNumber is required." });
    }

    return sendJson(res, 200, { order: await loadOrder(orderNumber) });
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    const orderNumber = String(body?.orderNumber || "").trim();
    if (!orderNumber) {
      return sendJson(res, 400, { error: "orderNumber is required." });
    }

    const patch = validateStatusPatch(body);
    await supabaseRequest(
      `/shop_orders?order_number=eq.${encodeURIComponent(orderNumber)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...patch,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return sendJson(res, 200, { order: await loadOrder(orderNumber) });
  }

  res.setHeader("Allow", "GET, PATCH");
  return sendJson(res, 405, { error: "Method not allowed." });
}

async function loadProducts(req, res) {
  const search = cleanText(firstQueryValue(req.query?.q));
  const status = cleanText(firstQueryValue(req.query?.status));
  const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const page = getPage(firstQueryValue(req.query?.page));
  const offset = page * limit;
  const statusFilter =
    status && validProductStatuses.has(status)
      ? `&status=eq.${encodeURIComponent(status)}`
      : "";
  const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
  const searchFilter = search
    ? `&or=(name.ilike.${searchTerm},slug.ilike.${searchTerm},category.ilike.${searchTerm})`
    : "";
  const select =
    "id,slug,name,subtitle,description,category,status,featured,sort_order,cover_image_url,created_at,updated_at";
  const products = await supabaseRequest(
    `/shop_products?select=${select}${statusFilter}${searchFilter}&order=updated_at.desc,sort_order.asc&limit=${
      limit + 1
    }&offset=${offset}`
  );
  const visibleProducts = (products || []).slice(0, limit);
  const productIds = visibleProducts.map((product) => product.id);
  const variantsByProductId = new Map();
  const imagesByProductId = new Map();

  if (productIds.length) {
    const idList = productIds.join(",");
    const [variants, images] = await Promise.all([
      supabaseRequest(
        `/shop_product_variants?select=id,product_id,sku,variant_name,variant_option,image_url,price,compare_at_price,inventory,status,sort_order,created_at,updated_at&product_id=in.(${idList})&order=sort_order.asc,created_at.asc`
      ),
      supabaseRequest(
        `/shop_product_images?select=id,product_id,image_url,alt,sort_order,created_at&product_id=in.(${idList})&order=sort_order.asc,created_at.asc`
      ),
    ]);

    for (const variant of variants || []) {
      const current = variantsByProductId.get(variant.product_id) || [];
      current.push(normalizeVariant(variant));
      variantsByProductId.set(variant.product_id, current);
    }

    for (const image of images || []) {
      const current = imagesByProductId.get(image.product_id) || [];
      current.push(normalizeImage(image));
      imagesByProductId.set(image.product_id, current);
    }
  }

  const hasMore = (products || []).length > limit;

  return sendJson(res, 200, {
    products: visibleProducts.map((product) =>
      normalizeProductSummary(product, variantsByProductId, imagesByProductId)
    ),
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}

async function loadProductById(productId) {
  const products = await supabaseRequest(
    `/shop_products?id=eq.${encodeURIComponent(productId)}&select=*&limit=1`
  );
  const product = products?.[0];

  if (!product) {
    const error = new Error("Product not found.");
    error.status = 404;
    throw error;
  }

  const [variants, images] = await Promise.all([
    supabaseRequest(
      `/shop_product_variants?product_id=eq.${encodeURIComponent(
        product.id
      )}&select=*&order=sort_order.asc,created_at.asc`
    ),
    supabaseRequest(
      `/shop_product_images?product_id=eq.${encodeURIComponent(
        product.id
      )}&select=*&order=sort_order.asc,created_at.asc`
    ),
  ]);

  return normalizeProduct(product, variants || [], images || []);
}

function validateProductPatch(product) {
  const id = cleanText(product?.id);
  const name = cleanText(product?.name);
  const slug = cleanText(product?.slug);
  const category = cleanText(product?.category);
  const status = cleanText(product?.status);

  if (!id) {
    const error = new Error("Product id is required.");
    error.status = 400;
    throw error;
  }

  if (!name || !slug || !category) {
    const error = new Error("Product name, slug, and category are required.");
    error.status = 400;
    throw error;
  }

  if (!validProductStatuses.has(status)) {
    const error = new Error("Invalid product status.");
    error.status = 400;
    throw error;
  }

  return {
    id,
    patch: {
      name,
      slug,
      subtitle: nullableText(product.subtitle),
      description: nullableText(product.description),
      category,
      status,
      featured: Boolean(product.featured),
      sort_order: getInteger(product.sort_order, 0),
      cover_image_url: nullableText(product.cover_image_url),
      updated_at: new Date().toISOString(),
    },
  };
}

async function ensureUniqueSlug(slug) {
  const existingProducts = await supabaseRequest(
    `/shop_products?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
  );

  if (existingProducts?.length) {
    const error = new Error("Product slug already exists.");
    error.status = 409;
    throw error;
  }
}

function validateProductCreate(product) {
  const name = cleanText(product?.name);
  const slug = cleanText(product?.slug);
  const category = cleanText(product?.category);
  const status = cleanText(product?.status || "draft");

  if (!name || !slug || !category) {
    const error = new Error("Product name, slug, and category are required.");
    error.status = 400;
    throw error;
  }

  if (!validProductStatuses.has(status)) {
    const error = new Error("Invalid product status.");
    error.status = 400;
    throw error;
  }

  return {
    name,
    slug,
    subtitle: nullableText(product.subtitle),
    description: nullableText(product.description),
    category,
    status,
    featured: Boolean(product.featured),
    sort_order: getInteger(product.sort_order, 0),
    cover_image_url: nullableText(product.cover_image_url),
  };
}

function buildVariantPatch(variant) {
  const status = cleanText(variant?.status || "active");
  const variantName = cleanText(variant?.variant_name);
  const price = getInteger(variant?.price, 0);
  const inventory = getInteger(variant?.inventory, 0);
  const compareAtPrice =
    variant?.compare_at_price === null ||
    variant?.compare_at_price === undefined ||
    cleanText(variant.compare_at_price) === ""
      ? null
      : getInteger(variant.compare_at_price, 0);

  if (!variantName) {
    const error = new Error("Variant name is required.");
    error.status = 400;
    throw error;
  }

  if (!validVariantStatuses.has(status)) {
    const error = new Error("Invalid variant status.");
    error.status = 400;
    throw error;
  }

  if (price < 0 || inventory < 0 || (compareAtPrice !== null && compareAtPrice < 0)) {
    const error = new Error("Variant price and inventory must be greater than or equal to 0.");
    error.status = 400;
    throw error;
  }

  return {
    sku: nullableText(variant.sku),
    variant_name: variantName,
    variant_option: nullableText(variant.variant_option),
    image_url: nullableText(variant.image_url),
    price,
    compare_at_price: compareAtPrice,
    inventory,
    status,
    sort_order: getInteger(variant.sort_order, 0),
    updated_at: new Date().toISOString(),
  };
}

function buildVariantCreate(variant, productId) {
  return {
    product_id: productId,
    ...buildVariantPatch(variant),
  };
}

function buildImagePatch(image) {
  const imageUrl = cleanText(image?.image_url);

  if (!imageUrl) {
    const error = new Error("Image URL is required.");
    error.status = 400;
    throw error;
  }

  return {
    image_url: imageUrl,
    alt: nullableText(image.alt),
    sort_order: getInteger(image.sort_order, 0),
  };
}

function buildImageCreate(image, productId) {
  return {
    product_id: productId,
    ...buildImagePatch(image),
  };
}

async function updateProduct(req, res) {
  const body = await readBody(req);
  const { id: productId, patch } = validateProductPatch(body?.product || {});
  const variants = Array.isArray(body?.variants) ? body.variants : [];
  const images = Array.isArray(body?.images) ? body.images : [];

  await supabaseRequest(`/shop_products?id=eq.${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  for (const variant of variants) {
    const variantId = cleanText(variant?.id);
    if (!variantId) continue;

    await supabaseRequest(
      `/shop_product_variants?id=eq.${encodeURIComponent(
        variantId
      )}&product_id=eq.${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(buildVariantPatch(variant)),
      }
    );
  }

  for (const image of images) {
    const imageId = cleanText(image?.id);
    if (!imageId) continue;

    await supabaseRequest(
      `/shop_product_images?id=eq.${encodeURIComponent(
        imageId
      )}&product_id=eq.${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(buildImagePatch(image)),
      }
    );
  }

  return sendJson(res, 200, { product: await loadProductById(productId) });
}

async function archiveIncompleteProduct(productId) {
  try {
    await supabaseRequest(`/shop_products?id=eq.${encodeURIComponent(productId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "archived",
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (archiveError) {
    console.error("failed to archive incomplete product:", archiveError);
  }
}

async function createProduct(req, res) {
  const body = await readBody(req);
  const productPayload = validateProductCreate(body?.product || {});
  const variants = Array.isArray(body?.variants) ? body.variants : [];
  const images = Array.isArray(body?.images) ? body.images : [];

  if (!variants.length) {
    return sendJson(res, 400, { error: "At least one product variant is required." });
  }

  if (!images.length) {
    return sendJson(res, 400, { error: "At least one product image is required." });
  }

  await ensureUniqueSlug(productPayload.slug);

  const createdProducts = await supabaseRequest("/shop_products", {
    method: "POST",
    body: JSON.stringify(productPayload),
  });
  const createdProduct = createdProducts?.[0];

  if (!createdProduct?.id) {
    const error = new Error("Product create failed.");
    error.status = 500;
    throw error;
  }

  try {
    await supabaseRequest("/shop_product_variants", {
      method: "POST",
      body: JSON.stringify(
        variants.map((variant) => buildVariantCreate(variant, createdProduct.id))
      ),
    });

    await supabaseRequest("/shop_product_images", {
      method: "POST",
      body: JSON.stringify(
        images.map((image) => buildImageCreate(image, createdProduct.id))
      ),
    });
  } catch (detailError) {
    await archiveIncompleteProduct(createdProduct.id);
    const error = new Error(
      `Product details create failed. The product was archived. ${detailError.message || ""}`.trim()
    );
    error.status = 500;
    throw error;
  }

  return sendJson(res, 201, { product: await loadProductById(createdProduct.id) });
}

async function handleProductAction(req, res) {
  if (req.method === "GET") {
    const productId = cleanText(firstQueryValue(req.query?.id));
    if (!productId) {
      return sendJson(res, 400, { error: "Product id is required." });
    }

    return sendJson(res, 200, { product: await loadProductById(productId) });
  }

  if (req.method === "PATCH") {
    return updateProduct(req, res);
  }

  if (req.method === "POST") {
    return createProduct(req, res);
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return sendJson(res, 405, { error: "Method not allowed." });
}

async function loadInventoryMovements(req, res) {
  const productId = cleanText(firstQueryValue(req.query?.productId));
  const variantId = cleanText(firstQueryValue(req.query?.variantId));
  const movementType = cleanText(firstQueryValue(req.query?.movementType));
  const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const page = getPage(firstQueryValue(req.query?.page));
  const offset = page * limit;
  const productFilter = productId
    ? `&product_id=eq.${encodeURIComponent(productId)}`
    : "";
  const variantFilter = variantId
    ? `&variant_id=eq.${encodeURIComponent(variantId)}`
    : "";
  const typeFilter =
    movementType && validInventoryMovementTypes.has(movementType)
      ? `&movement_type=eq.${encodeURIComponent(movementType)}`
      : "";
  const select =
    "id,product_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_number,note,created_at,created_by";
  const movements = await supabaseRequest(
    `/shop_inventory_movements?select=${select}${productFilter}${variantFilter}${typeFilter}&order=created_at.desc&limit=${
      limit + 1
    }&offset=${offset}`
  );
  const visibleMovements = (movements || []).slice(0, limit);
  const productIds = [
    ...new Set(visibleMovements.map((movement) => movement.product_id).filter(Boolean)),
  ];
  const variantIds = [
    ...new Set(visibleMovements.map((movement) => movement.variant_id).filter(Boolean)),
  ];
  const productsById = new Map();
  const variantsById = new Map();

  if (productIds.length) {
    const products = await supabaseRequest(
      `/shop_products?select=id,slug,name&id=in.(${productIds.join(",")})`
    );

    for (const product of products || []) {
      productsById.set(product.id, product);
    }
  }

  if (variantIds.length) {
    const variants = await supabaseRequest(
      `/shop_product_variants?select=id,sku,variant_name,variant_option&id=in.(${variantIds.join(",")})`
    );

    for (const variant of variants || []) {
      variantsById.set(variant.id, variant);
    }
  }

  const hasMore = (movements || []).length > limit;

  return sendJson(res, 200, {
    movements: visibleMovements.map((movement) =>
      normalizeInventoryMovement(movement, productsById, variantsById)
    ),
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}

async function lookupInventoryBySku(req, res) {
  const sku = cleanText(firstQueryValue(req.query?.sku));

  if (!sku) {
    return sendJson(res, 400, { error: "sku is required." });
  }

  const variants = await supabaseRequest(
    `/shop_product_variants?sku=eq.${encodeURIComponent(sku)}&select=*&limit=2`
  );

  if (!variants?.length) {
    return sendJson(res, 404, { error: "Product variant not found." });
  }

  if (variants.length > 1) {
    return sendJson(res, 409, {
      error: "商品編號重複，請先修正商品資料。",
    });
  }

  const variant = variants[0];
  const products = await supabaseRequest(
    `/shop_products?id=eq.${encodeURIComponent(variant.product_id)}&select=id,slug,name,category,status,cover_image_url&limit=1`
  );
  const product = products?.[0];

  if (!product) {
    return sendJson(res, 404, { error: "Product not found." });
  }

  return sendJson(res, 200, normalizeInventoryLookup(product, variant));
}

async function searchInventory(req, res) {
  const search = cleanText(firstQueryValue(req.query?.q));
  const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
  const productSearchFilter = search
    ? `&or=(name.ilike.${searchTerm},slug.ilike.${searchTerm},category.ilike.${searchTerm})`
    : "";
  const variantSearchFilter = search
    ? `&or=(sku.ilike.${searchTerm},variant_name.ilike.${searchTerm},variant_option.ilike.${searchTerm})`
    : "";
  const productMatches = await supabaseRequest(
    `/shop_products?select=id,slug,name,category,status,cover_image_url${productSearchFilter}&order=updated_at.desc&limit=20`
  );
  const variantMatches = await supabaseRequest(
    `/shop_product_variants?select=*&status=eq.active${variantSearchFilter}&order=updated_at.desc&limit=${limit}`
  );
  const productsById = new Map();
  const variantsById = new Map();

  for (const product of productMatches || []) {
    productsById.set(product.id, product);
  }

  for (const variant of variantMatches || []) {
    variantsById.set(variant.id, variant);
  }

  const productMatchIds = (productMatches || []).map((product) => product.id);
  if (productMatchIds.length) {
    const productVariants = await supabaseRequest(
      `/shop_product_variants?select=*&status=eq.active&product_id=in.(${productMatchIds.join(
        ","
      )})&order=sort_order.asc,created_at.asc`
    );

    for (const variant of productVariants || []) {
      variantsById.set(variant.id, variant);
    }
  }

  const missingProductIds = [
    ...new Set(
      Array.from(variantsById.values())
        .map((variant) => variant.product_id)
        .filter((productId) => productId && !productsById.has(productId))
    ),
  ];

  if (missingProductIds.length) {
    const products = await supabaseRequest(
      `/shop_products?select=id,slug,name,category,status,cover_image_url&id=in.(${missingProductIds.join(
        ","
      )})`
    );

    for (const product of products || []) {
      productsById.set(product.id, product);
    }
  }

  const results = Array.from(variantsById.values())
    .map((variant) => {
      const product = productsById.get(variant.product_id);
      return product ? normalizeInventorySearchItem(product, variant) : null;
    })
    .filter(Boolean)
    .slice(0, limit);

  return sendJson(res, 200, { results });
}

async function handleInventoryAdjustment(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const body = await readBody(req);
  const variantId = cleanText(body?.variant_id);
  const movementType = cleanText(body?.movement_type);
  const quantity = getRequiredInteger(body?.quantity, "quantity");

  if (!variantId) {
    return sendJson(res, 400, { error: "variant_id is required." });
  }

  if (!["stock_in", "stock_out", "adjustment"].includes(movementType)) {
    return sendJson(res, 400, { error: "Invalid movement_type." });
  }

  if (
    (movementType === "stock_in" || movementType === "stock_out") &&
    quantity <= 0
  ) {
    return sendJson(res, 400, { error: "Quantity must be greater than 0." });
  }

  if (movementType === "adjustment" && quantity < 0) {
    return sendJson(res, 400, { error: "Quantity must be greater than or equal to 0." });
  }

  try {
    const result = await supabaseRpc("adjust_shop_inventory", {
      adjustment_payload: {
        variant_id: variantId,
        movement_type: movementType,
        quantity,
        reference_type: "manual_adjustment",
        reference_number: nullableText(body?.reference_number),
        note: nullableText(body?.note),
        created_by: nullableText(body?.created_by) || "admin",
      },
    });
    const movement = result?.movement || null;

    return sendJson(res, 200, {
      inventory: Number(result?.inventory || 0),
      movement: movement ? normalizeInventoryMovement(movement) : null,
    });
  } catch (rpcError) {
    const knownMessage = getKnownInventoryErrorMessage(rpcError);
    if (knownMessage) {
      return sendJson(res, 409, { error: knownMessage });
    }

    throw rpcError;
  }
}

function normalizeManualSaleItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      variant_id: cleanText(item?.variant_id),
      quantity: getInteger(item?.quantity, 0),
    }))
    .filter((item) => item.variant_id && item.quantity > 0);
}

async function handleManualSale(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const body = await readBody(req);
  const paymentMethod = cleanText(body?.payment_method || "cash");
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = normalizeManualSaleItems(rawItems);

  if (!validPosPaymentMethods.has(paymentMethod)) {
    return sendJson(res, 400, { error: "Invalid payment_method." });
  }

  if (!items.length || items.length !== rawItems.length) {
    return sendJson(res, 400, { error: "At least one sale item is required." });
  }

  try {
    const order = await supabaseRpc("create_manual_sale_order", {
      sale_payload: {
        payment_method: paymentMethod,
        note: nullableText(body?.note) || "現場銷售",
        items,
      },
    });

    return sendJson(res, 201, { order });
  } catch (rpcError) {
    const knownMessage = getKnownManualSaleErrorMessage(rpcError);
    if (knownMessage) {
      return sendJson(res, 409, { error: knownMessage });
    }

    throw rpcError;
  }
}

export default async function handler(req, res) {
  const action = String(firstQueryValue(req.query?.action) || "").trim();

  try {
    requireAdmin(req);

    if (req.method === "GET" && action === "meta-status") {
      return await loadMetaStatus(req, res);
    }

    if (req.method === "GET" && action === "dashboard") {
      return await loadDashboard(req, res);
    }

    if (req.method === "GET" && action === "orders") {
      return await loadOrders(req, res);
    }

    if (req.method === "GET" && action === "order-items-export") {
      return await loadOrderItemsExport(req, res);
    }

    if (action === "order") {
      return await handleOrderAction(req, res);
    }

    if (req.method === "GET" && action === "products") {
      return await loadProducts(req, res);
    }

    if (action === "product") {
      return await handleProductAction(req, res);
    }

    if (req.method === "GET" && action === "inventory-movements") {
      return await loadInventoryMovements(req, res);
    }

    if (req.method === "GET" && action === "inventory-lookup") {
      return await lookupInventoryBySku(req, res);
    }

    if (req.method === "GET" && action === "inventory-search") {
      return await searchInventory(req, res);
    }

    if (action === "inventory-adjust") {
      return await handleInventoryAdjustment(req, res);
    }

    if (action === "manual-sale") {
      return await handleManualSale(req, res);
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { error: "Method or action not allowed." });
  } catch (error) {
    console.error("admin shop api error:", error);
    return sendJson(res, error.status || 500, {
      error:
        error.status === 401
          ? "Unauthorized."
          : error.status === 400 || error.status === 404 || error.status === 409
            ? error.message
            : "Admin shop request failed.",
    });
  }
}
