import { firstQueryValue, sendJson, supabaseRequest } from "./_shared.js";

function normalizeVariant(variant) {
  return {
    id: variant.id,
    sku: variant.sku || "",
    product_id: variant.product_id,
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
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
  } catch (error) {
    console.error("shop products error:", error);
    return sendJson(res, 500, { error: "Failed to load products." });
  }
}
