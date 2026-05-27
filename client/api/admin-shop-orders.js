import {
  firstQueryValue,
  getServerEnv,
  sendJson,
  supabaseRequest,
} from "./_shop_shared.js";

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

function normalizeOrder(order) {
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
    created_at: order.created_at || "",
    updated_at: order.updated_at || "",
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    requireAdmin(req);

    const search = String(firstQueryValue(req.query?.q) || "").trim();
    const status = String(firstQueryValue(req.query?.status) || "").trim();
    const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
    const page = getPage(firstQueryValue(req.query?.page));
    const offset = page * limit;
    const select =
      "id,order_number,customer_name,customer_phone,customer_email,subtotal,shipping_fee,total,payment_method,payment_status,order_status,created_at,updated_at";
    const statusFilter =
      status && validOrderStatuses.has(status)
        ? `&order_status=eq.${encodeURIComponent(status)}`
        : "";
    const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
    const searchFilter = search
      ? `&or=(order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_phone.ilike.${searchTerm})`
      : "";
    const orders = await supabaseRequest(
      `/shop_orders?select=${select}${statusFilter}${searchFilter}&order=created_at.desc&limit=${
        limit + 1
      }&offset=${offset}`
    );
    const hasMore = (orders || []).length > limit;

    return sendJson(res, 200, {
      orders: (orders || []).slice(0, limit).map(normalizeOrder),
      page,
      limit,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    });
  } catch (error) {
    console.error("admin shop orders error:", error);
    return sendJson(res, error.status || 500, {
      error: error.status === 401 ? "Unauthorized." : "Failed to load orders.",
    });
  }
}
