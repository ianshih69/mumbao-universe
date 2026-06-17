const loadFallback = () => import("../server/adminShop/fallback.js");
const loadWarehouseMedia = () => import("../server/adminShop/warehouseMedia.js");
const loadUsersRoles = () => import("../server/adminShop/usersRoles.js");

const ROUTES = {
  test: () => import("../server/adminShop/test.js"),
  "admin-login": loadFallback,
  "admin-legacy-login": () => import("../server/adminShop/legacyLogin.js"),
  "admin-refresh": loadFallback,
  "admin-bootstrap-super": loadFallback,
  "admin-session": loadFallback,
  "admin-users": loadUsersRoles,
  "admin-roles": loadUsersRoles,
  "admin-audit-logs": loadFallback,
  "instagram-oauth-start": loadFallback,
  "meta-status": loadFallback,
  "debug-facebook-token": loadFallback,
  "publish-facebook-post": loadFallback,
  "publish-instagram-post": loadFallback,
  "publish-threads-post": loadFallback,
  "social-posts-sync": loadFallback,
  "social-posts": loadFallback,
  "sync-facebook-post": loadFallback,
  "delete-facebook-post": loadFallback,
  "exchange-meta-token": loadFallback,
  dashboard: loadFallback,
  orders: loadFallback,
  "order-items-export": loadFallback,
  order: loadFallback,
  products: loadFallback,
  product: loadFallback,
  "inventory-movements": loadFallback,
  "inventory-lookup": loadFallback,
  "inventory-search": loadFallback,
  "inventory-adjust": loadFallback,
  "manual-sale": loadFallback,
  "warehouse-dashboard": loadFallback,
  "warehouse-locations": loadFallback,
  "warehouse-supply": loadFallback,
  "warehouse-supply-quantity": () =>
    import("../server/adminShop/warehouseSupplyQuantity.js"),
  "warehouse-furniture-asset": loadFallback,
  "warehouse-housekeeping-record": loadFallback,
  "warehouse-media-upload": loadWarehouseMedia,
  "warehouse-media": loadWarehouseMedia,
  "warehouse-media-delete": loadWarehouseMedia,
  fallback: loadFallback,
};

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res, status, body) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(body);
  }

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const action = String(firstQueryValue(req.query?.action) || "").trim();

  console.log("[admin-shop] action =", action);

  try {
    const loader = ROUTES[action];

    if (!loader) {
      return sendJson(res, 404, {
        ok: false,
        error: "unknown action",
        action,
      });
    }

    const mod = await loader();

    if (!mod?.default) {
      return sendJson(res, 500, {
        ok: false,
        error: "invalid handler export",
      });
    }

    return await mod.default(req, res);
  } catch (err) {
    console.error("[admin-shop crash]", {
      action,
      message: err?.message,
      stack: err?.stack,
    });

    return sendJson(res, 500, {
      ok: false,
      error: "internal_error",
      action,
      message: err?.message,
    });
  }
}
