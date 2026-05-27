import {
  firstQueryValue,
  readBody,
  sendJson,
  supabaseRequest,
  supabaseRpc,
} from "../server/shopShared.js";

const knownOrderErrors = new Map([
  ["ORDER_ITEMS_REQUIRED", "購物車目前沒有商品。"],
  ["CUSTOMER_NAME_REQUIRED", "請填寫收件人姓名。"],
  ["CUSTOMER_PHONE_REQUIRED", "請填寫聯絡電話。"],
  ["SHIPPING_ADDRESS_REQUIRED", "請填寫收件地址。"],
  ["INVALID_QUANTITY", "商品數量不正確。"],
  ["VARIANT_NOT_FOUND", "部分商品規格已下架，請重新整理購物車。"],
  ["PRODUCT_NOT_AVAILABLE", "部分商品目前無法購買，請重新整理購物車。"],
  ["INSUFFICIENT_INVENTORY", "部分商品庫存不足，請調整數量。"],
]);

function normalizeVariant(variant) {
  return {
    id: variant.id,
    sku: variant.sku || "",
    product_id: variant.product_id,
    variant_name: variant.variant_name || "",
    variant_option: variant.variant_option || null,
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
    category: product.category || "文創商品",
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
      `/shop_product_variants?select=id,product_id,sku,variant_name,variant_option,price,compare_at_price,inventory,status,sort_order&product_id=in.(${productIds.join(
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
      )}&status=eq.active&select=id,product_id,sku,variant_name,variant_option,price,compare_at_price,inventory,status,sort_order&order=sort_order.asc,created_at.asc`
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
      category: product.category || "文創商品",
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
  const payload = {
    customer: {
      name: String(body?.customer?.name || "").trim(),
      phone: String(body?.customer?.phone || "").trim(),
      email: String(body?.customer?.email || "").trim(),
      address: String(body?.customer?.address || "").trim(),
    },
    note: String(body?.note || "").trim(),
    items: normalizeItems(body?.items),
  };

  if (!payload.items.length) {
    return sendJson(res, 400, { error: "購物車目前沒有商品。" });
  }

  const order = await supabaseRpc("create_shop_order", {
    order_payload: payload,
  });

  return sendJson(res, 201, { order });
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

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method or action not allowed." });
  } catch (error) {
    const knownOrderErrorMessage = getKnownOrderErrorMessage(error);
    if (knownOrderErrorMessage) {
      return sendJson(res, 409, { error: knownOrderErrorMessage });
    }

    console.error("shop api error:", error);
    return sendJson(res, 500, { error: "Shop request failed." });
  }
}
