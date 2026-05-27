import { firstQueryValue, sendJson, supabaseRequest } from "./_shop_shared.js";

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

function normalizeImage(image) {
  return {
    id: image.id,
    image_url: image.image_url || "",
    alt: image.alt || "",
    sort_order: Number(image.sort_order || 0),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
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
  } catch (error) {
    console.error("shop product detail error:", error);
    return sendJson(res, 500, { error: "Failed to load product." });
  }
}
