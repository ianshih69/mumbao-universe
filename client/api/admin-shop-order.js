import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
} from "./_shop_shared.js";

const validOrderStatuses = new Set([
  "pending_confirm",
  "pending_payment",
  "paid",
  "shipping",
  "completed",
  "cancelled",
]);
const validPaymentStatuses = new Set([
  "pending",
  "confirmed",
  "failed",
  "refunded",
]);

function requireAdmin(req) {
  const adminPassword = String(getServerEnv("ADMIN_PASSWORD") || "").trim();
  const authHeader = String(req.headers?.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const providedPassword = bearerToken || String(req.headers?.["x-admin-password"] || "").trim();

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

function normalizeOrder(order, items = []) {
  return {
    id: order.id,
    order_number: order.order_number || "",
    customer_name: order.customer_name || "",
    customer_phone: order.customer_phone || "",
    customer_email: order.customer_email || "",
    shipping_address: order.shipping_address || "",
    note: order.note || "",
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    payment_method: order.payment_method || "manual_confirmation",
    payment_status: order.payment_status || "pending",
    order_status: order.order_status || "pending_confirm",
    created_at: order.created_at || "",
    updated_at: order.updated_at || "",
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

export default async function handler(req, res) {
  try {
    requireAdmin(req);

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
  } catch (error) {
    console.error("admin shop order error:", error);
    return sendJson(res, error.status || 500, {
      error:
        error.status === 401
          ? "Unauthorized."
          : error.status === 404
            ? "Order not found."
            : error.status === 400
              ? error.message
              : "Failed to load order.",
    });
  }
}
