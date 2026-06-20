import { createHash, createHmac } from "node:crypto";
import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
  supabaseRpc,
} from "../server/shopShared.js";

const lookupTokenInvalidMessage = "查詢連結無效或已失效。";
const lookupBodyLimitBytes = 2048;
const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,128}$/;
const lookupTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

const knownOrderErrors = new Map([
  ["ORDER_ITEMS_REQUIRED", "購物車內沒有可結帳的商品。"],
  ["CUSTOMER_NAME_REQUIRED", "請填寫收件人姓名。"],
  ["CUSTOMER_PHONE_REQUIRED", "請填寫聯絡電話。"],
  ["SHIPPING_ADDRESS_REQUIRED", "請填寫收件地址。"],
  ["INVALID_QUANTITY", "商品數量不正確。"],
  ["VARIANT_NOT_FOUND", "商品規格已不存在，請重新選擇商品。"],
  ["PRODUCT_NOT_AVAILABLE", "商品目前無法購買，請重新確認購物車。"],
  ["INSUFFICIENT_INVENTORY", "商品庫存不足，請調整數量。"],
  ["INVALID_CHECKOUT_IDEMPOTENCY_KEY", "結帳安全憑證無效，請重新整理後再試。"],
]);

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getOptionalCustomerBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header) return null;

  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw createHttpError(401, "請重新登入會員後再下單。");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw createHttpError(401, "請重新登入會員後再下單。");
  }

  return token;
}

async function getCustomerAuthUser(accessToken) {
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = getServerEnv("SUPABASE_URL").replace(/\/$/, "");

  if (!serviceRoleKey || !supabaseUrl) {
    throw createHttpError(500, "Server configuration error.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw createHttpError(401, "請重新登入會員後再下單。");
  }

  if (!response.ok) {
    throw createHttpError(500, "會員資料暫時無法確認，請稍後再試。");
  }

  const user = await response.json();
  if (!user?.id || !user?.email) {
    throw createHttpError(401, "請重新登入會員後再下單。");
  }

  return user;
}

function normalizeCustomerEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findCustomerProfile(authUserId) {
  const rows = await supabaseRequest(
    `/shop_customer_profiles?auth_user_id=eq.${encodeURIComponent(
      authUserId
    )}&select=id,auth_user_id,email,name,phone,is_active&limit=1`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function isCustomerProfileUniqueConflict(error) {
  const message = String(error?.message || "");
  return (
    message.includes("23505") ||
    message.toLowerCase().includes("duplicate") ||
    message.includes("shop_customer_profiles_auth_user_id_key")
  );
}

async function ensureCustomerProfile(user) {
  const existing = await findCustomerProfile(user.id);
  if (existing) {
    if (existing.is_active === false) {
      throw createHttpError(403, "此會員帳號目前已停用，請聯絡客服。");
    }
    return existing;
  }

  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const payload = {
    auth_user_id: user.id,
    email: normalizeCustomerEmail(user.email),
    name: typeof metadata.name === "string" ? metadata.name.trim() || null : null,
    phone: typeof metadata.phone === "string" ? metadata.phone.trim() || null : null,
  };

  try {
    const rows = await supabaseRequest(
      "/shop_customer_profiles?select=id,auth_user_id,email,name,phone,is_active",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    const inserted = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (inserted?.is_active === false) {
      throw createHttpError(403, "此會員帳號目前已停用，請聯絡客服。");
    }
    return inserted;
  } catch (error) {
    if (!isCustomerProfileUniqueConflict(error)) {
      throw error;
    }
  }

  const profile = await findCustomerProfile(user.id);
  if (!profile) {
    throw createHttpError(500, "會員資料暫時無法建立，請稍後再試。");
  }

  if (profile.is_active === false) {
    throw createHttpError(403, "此會員帳號目前已停用，請聯絡客服。");
  }

  return profile;
}

async function resolveCustomerProfileId(req) {
  const accessToken = getOptionalCustomerBearerToken(req);
  if (!accessToken) return null;

  const user = await getCustomerAuthUser(accessToken);
  const profile = await ensureCustomerProfile(user);
  return profile.id;
}

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getLookupSecret() {
  const secret = getServerEnv("SHOP_ORDER_LOOKUP_SECRET");
  if (!secret) {
    throw createHttpError(500, "Server configuration error.");
  }

  return secret;
}

function createLookupToken(checkoutIdempotencyKey) {
  return toBase64Url(
    createHmac("sha256", getLookupSecret())
      .update(checkoutIdempotencyKey, "utf8")
      .digest()
  );
}

function hashLookupToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isValidIdempotencyKey(value) {
  return typeof value === "string" && idempotencyKeyPattern.test(value);
}

function isValidLookupToken(value) {
  return typeof value === "string" && lookupTokenPattern.test(value);
}

async function readLimitedBody(req, maxBytes) {
  const contentLength = Number.parseInt(String(req.headers?.["content-length"] || ""), 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw createHttpError(413, "Request body too large.");
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > maxBytes) {
      throw createHttpError(413, "Request body too large.");
    }
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw createHttpError(413, "Request body too large.");
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function normalizeVariant(variant) {
  return {
    id: variant.id,
    sku: variant.sku || "",
    product_id: variant.product_id,
    variant_name: variant.variant_name || "",
    variant_option: variant.variant_option || null,
    image_url: variant.image_url || null,
    price: Number(variant.price || 0),
    compare_at_price:
      variant.compare_at_price === null || variant.compare_at_price === undefined
        ? null
        : Number(variant.compare_at_price),
    inventory: Number(variant.inventory || 0),
    status: variant.status || "active",
    sort_order: Number(variant.sort_order || 0),
  };
}

function normalizeProduct(product, variantsByProductId) {
  const variants = variantsByProductId.get(product.id) || [];
  const prices = variants.map((variant) => Number(variant.price || 0));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle || "",
    description: product.description || "",
    category: product.category || "商品",
    cover_image_url: product.cover_image_url || "",
    featured: Boolean(product.featured),
    sort_order: Number(product.sort_order || 0),
    min_price: prices.length ? Math.min(...prices) : 0,
    total_inventory: variants.reduce(
      (total, variant) => total + Number(variant.inventory || 0),
      0
    ),
    variants,
  };
}

function normalizeImage(image) {
  return {
    id: image.id,
    image_url: image.image_url || "",
    alt: image.alt || "",
    sort_order: Number(image.sort_order || 0),
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      variant_id: String(item?.variant_id || item?.variantId || "").trim(),
      quantity: Number.parseInt(String(item?.quantity || ""), 10),
    }))
    .filter((item) => item.variant_id && Number.isFinite(item.quantity));
}

function getKnownOrderErrorMessage(error) {
  const message = String(error?.details?.message || error?.message || "");
  const matchedKey = Array.from(knownOrderErrors.keys()).find((key) =>
    message.includes(key)
  );

  return matchedKey ? knownOrderErrors.get(matchedKey) : "";
}

function maskEmail(email) {
  const value = String(email || "").trim();
  if (!value || !value.includes("@")) return "";

  const [name, domain] = value.split("@");
  const visibleName = name.slice(0, 1);
  return `${visibleName}${name.length > 1 ? "***" : "*"}@${domain}`;
}

function maskPhone(phone) {
  const value = String(phone || "").replace(/\s+/g, "");
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-3)}`;
}

function maskAddress(address) {
  const value = String(address || "").trim();
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 6)}***`;
}

function maskName(name) {
  const value = String(name || "").trim();
  if (!value) return "";
  if (value.length <= 1) return value;
  return `${value.slice(0, 1)}${"*".repeat(Math.min(value.length - 1, 2))}`;
}

function normalizePublicOrder(order, items) {
  return {
    order_number: order.order_number,
    created_at: order.created_at,
    order_status: order.order_status,
    payment_status: order.payment_status,
    shipping_carrier: order.shipping_carrier || null,
    tracking_number: order.tracking_number || null,
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    customer: {
      name: maskName(order.customer_name),
      phone: maskPhone(order.customer_phone),
      email: maskEmail(order.customer_email),
      address: maskAddress(order.shipping_address),
    },
    items: (items || []).map((item) => ({
      product_name: item.product_name || "",
      product_image_url: item.product_image_url || null,
      variant_name: item.variant_name || "",
      variant_option: item.variant_option || "",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.line_total || 0),
    })),
  };
}

function normalizeCreatedOrder(order) {
  return {
    id: order.id,
    order_number: order.order_number,
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    payment_status: order.payment_status || "pending",
    order_status: order.order_status || "pending_confirm",
  };
}

async function loadProducts(req, res) {
  const category = String(firstQueryValue(req.query?.category) || "").trim();
  const categoryFilter = category
    ? `&category=eq.${encodeURIComponent(category)}`
    : "";
  const products = await supabaseRequest(
    `/shop_products?select=id,slug,name,subtitle,description,category,cover_image_url,featured,sort_order,status&status=eq.published${categoryFilter}&order=sort_order.asc,created_at.desc`
  );
  const productIds = (products || []).map((product) => product.id);
  const variantsByProductId = new Map();

  if (productIds.length) {
    const variants = await supabaseRequest(
      `/shop_product_variants?select=id,product_id,sku,variant_name,variant_option,image_url,price,compare_at_price,inventory,status,sort_order&product_id=in.(${productIds.join(
        ","
      )})&status=eq.active&order=sort_order.asc,created_at.asc`
    );

    for (const variant of variants || []) {
      const normalizedVariant = normalizeVariant(variant);
      const current = variantsByProductId.get(variant.product_id) || [];
      current.push(normalizedVariant);
      variantsByProductId.set(variant.product_id, current);
    }
  }

  return sendJson(res, 200, {
    products: (products || []).map((product) =>
      normalizeProduct(product, variantsByProductId)
    ),
  });
}

async function loadProduct(req, res) {
  const slug = String(firstQueryValue(req.query?.slug) || "").trim();

  if (!slug) {
    return sendJson(res, 400, { error: "Product slug is required." });
  }

  const products = await supabaseRequest(
    `/shop_products?slug=eq.${encodeURIComponent(
      slug
    )}&status=eq.published&select=id,slug,name,subtitle,description,category,cover_image_url,featured,sort_order,status&limit=1`
  );
  const product = products?.[0];

  if (!product) {
    return sendJson(res, 404, { error: "Product not found." });
  }

  const [variants, images] = await Promise.all([
    supabaseRequest(
      `/shop_product_variants?product_id=eq.${encodeURIComponent(
        product.id
      )}&status=eq.active&select=id,product_id,sku,variant_name,variant_option,image_url,price,compare_at_price,inventory,status,sort_order&order=sort_order.asc,created_at.asc`
    ),
    supabaseRequest(
      `/shop_product_images?product_id=eq.${encodeURIComponent(
        product.id
      )}&select=id,image_url,alt,sort_order&order=sort_order.asc,created_at.asc`
    ),
  ]);
  const normalizedVariants = (variants || []).map(normalizeVariant);
  const prices = normalizedVariants.map((variant) => variant.price);

  return sendJson(res, 200, {
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      subtitle: product.subtitle || "",
      description: product.description || "",
      category: product.category || "商品",
      cover_image_url: product.cover_image_url || "",
      featured: Boolean(product.featured),
      sort_order: Number(product.sort_order || 0),
      min_price: prices.length ? Math.min(...prices) : 0,
      total_inventory: normalizedVariants.reduce(
        (total, variant) => total + variant.inventory,
        0
      ),
      variants: normalizedVariants,
      images: (images || []).map(normalizeImage),
    },
  });
}

async function createOrder(req, res) {
  const body = await readBody(req);
  const checkoutIdempotencyKey = String(body?.checkout_idempotency_key || "").trim();

  if (!isValidIdempotencyKey(checkoutIdempotencyKey)) {
    return sendJson(res, 400, { error: "結帳安全憑證無效，請重新整理後再試。" });
  }

  const lookupToken = createLookupToken(checkoutIdempotencyKey);
  const lookupTokenHash = hashLookupToken(lookupToken);
  const customerProfileId = await resolveCustomerProfileId(req);
  const payload = {
    customer: {
      name: String(body?.customer?.name || "").trim(),
      phone: String(body?.customer?.phone || "").trim(),
      email: String(body?.customer?.email || "").trim(),
      address: String(body?.customer?.address || "").trim(),
    },
    note: String(body?.note || "").trim(),
    items: normalizeItems(body?.items),
    checkout_idempotency_key: checkoutIdempotencyKey,
    guest_lookup_token_hash: lookupTokenHash,
    ...(customerProfileId ? { customer_profile_id: customerProfileId } : {}),
  };

  if (!payload.items.length) {
    return sendJson(res, 400, { error: "購物車內沒有可結帳的商品。" });
  }

  const order = await supabaseRpc("create_shop_order", {
    order_payload: payload,
  });

  return sendJson(res, 201, { order: normalizeCreatedOrder(order), lookupToken });
}

async function lookupOrder(req, res) {
  let body;
  try {
    body = await readLimitedBody(req, lookupBodyLimitBytes);
  } catch (error) {
    if (error?.statusCode === 413) {
      throw error;
    }
    return sendJson(res, 404, { error: lookupTokenInvalidMessage });
  }

  const token = String(body?.token || "").trim();

  if (!isValidLookupToken(token)) {
    return sendJson(res, 404, { error: lookupTokenInvalidMessage });
  }

  const tokenHash = hashLookupToken(token);
  const orders = await supabaseRequest(
    `/shop_orders?guest_lookup_token_hash=eq.${encodeURIComponent(
      tokenHash
    )}&select=id,order_number,created_at,customer_name,customer_phone,customer_email,shipping_address,subtotal,shipping_fee,total,payment_status,order_status,shipping_carrier,tracking_number&limit=1`
  );
  const order = orders?.[0];

  if (!order) {
    return sendJson(res, 404, { error: lookupTokenInvalidMessage });
  }

  const items = await supabaseRequest(
    `/shop_order_items?order_id=eq.${encodeURIComponent(
      order.id
    )}&select=product_name,product_image_url,variant_name,variant_option,quantity,unit_price,line_total&order=created_at.asc`
  );

  return sendJson(res, 200, { order: normalizePublicOrder(order, items) });
}

export default async function handler(req, res) {
  const action = String(firstQueryValue(req.query?.action) || "").trim();

  try {
    if (req.method === "GET" && action === "products") {
      return await loadProducts(req, res);
    }

    if (req.method === "GET" && action === "product") {
      return await loadProduct(req, res);
    }

    if (req.method === "POST" && action === "order") {
      return await createOrder(req, res);
    }

    if (req.method === "POST" && action === "order-lookup") {
      return await lookupOrder(req, res);
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method or action not allowed." });
  } catch (error) {
    if (error?.statusCode) {
      return sendJson(res, error.statusCode, { error: error.message });
    }

    const knownOrderErrorMessage = getKnownOrderErrorMessage(error);
    if (knownOrderErrorMessage) {
      return sendJson(res, 409, { error: knownOrderErrorMessage });
    }

    console.error("shop api error:", {
      message: error?.message,
      stack: error?.stack,
    });
    return sendJson(res, 500, { error: "Shop request failed." });
  }
}
