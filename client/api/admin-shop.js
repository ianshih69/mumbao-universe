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
    created_at: order.created_at || "",
    updated_at: order.updated_at || "",
  };
}

function normalizeOrder(order, items = []) {
  return {
    ...normalizeOrderSummary(order),
    shipping_address: order.shipping_address || "",
    note: order.note || "",
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

async function loadOrders(req, res) {
  const search = String(firstQueryValue(req.query?.q) || "").trim();
  const status = String(firstQueryValue(req.query?.status) || "").trim();
  const source = String(firstQueryValue(req.query?.source) || "").trim();
  const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const page = getPage(firstQueryValue(req.query?.page));
  const offset = page * limit;
  const select =
    "id,order_number,customer_name,customer_phone,customer_email,subtotal,shipping_fee,total,payment_method,payment_status,order_status,order_source,created_at,updated_at";
  const statusFilter =
    status && validOrderStatuses.has(status)
      ? `&order_status=eq.${encodeURIComponent(status)}`
      : "";
  const sourceFilter =
    source && validOrderSources.has(source)
      ? `&order_source=eq.${encodeURIComponent(source)}`
      : "";
  const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
  const searchFilter = search
    ? `&or=(order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_phone.ilike.${searchTerm})`
    : "";
  const orders = await supabaseRequest(
    `/shop_orders?select=${select}${statusFilter}${sourceFilter}${searchFilter}&order=created_at.desc&limit=${
      limit + 1
    }&offset=${offset}`
  );
  const hasMore = (orders || []).length > limit;

  return sendJson(res, 200, {
    orders: (orders || []).slice(0, limit).map(normalizeOrderSummary),
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
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

  if (!Object.keys(patch).length) {
    const error = new Error("No status fields to update.");
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
        `/shop_product_variants?select=id,product_id,sku,variant_name,variant_option,price,compare_at_price,inventory,status,sort_order,created_at,updated_at&product_id=in.(${idList})&order=sort_order.asc,created_at.asc`
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

    if (req.method === "GET" && action === "orders") {
      return await loadOrders(req, res);
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
