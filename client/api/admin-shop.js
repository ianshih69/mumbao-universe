import legacyLogin from "../server/adminShop/legacyLogin.js";
import warehouseSupplyQuantity from "../server/adminShop/warehouseSupplyQuantity.js";
import warehouseMedia from "../server/adminShop/warehouseMedia.js";
import usersRoles from "../server/adminShop/usersRoles.js";
import test from "../server/adminShop/test.js";
import fallback from "../server/adminShop/fallback.js";

const ROUTES = {
  test,
  "admin-login": fallback,
  "admin-legacy-login": legacyLogin,
  "admin-refresh": fallback,
  "admin-bootstrap-super": fallback,
  "admin-session": fallback,
  "admin-users": usersRoles,
  "admin-roles": usersRoles,
  "admin-audit-logs": fallback,
  "instagram-oauth-start": fallback,
  "meta-status": fallback,
  "debug-facebook-token": fallback,
  "publish-facebook-post": fallback,
  "publish-instagram-post": fallback,
  "publish-threads-post": fallback,
  "social-posts-sync": fallback,
  "social-posts": fallback,
  "sync-facebook-post": fallback,
  "delete-facebook-post": fallback,
  "exchange-meta-token": fallback,
  dashboard: fallback,
  orders: fallback,
  "order-items-export": fallback,
  order: fallback,
  products: fallback,
  product: fallback,
  "inventory-movements": fallback,
  "inventory-lookup": fallback,
  "inventory-search": fallback,
  "inventory-adjust": fallback,
  "manual-sale": fallback,
  "warehouse-dashboard": fallback,
  "warehouse-locations": fallback,
  "warehouse-supply": fallback,
  "warehouse-supply-quantity": warehouseSupplyQuantity,
  "warehouse-furniture-asset": fallback,
  "warehouse-housekeeping-record": fallback,
  "warehouse-media-upload": warehouseMedia,
  "warehouse-media": warehouseMedia,
  "warehouse-media-delete": warehouseMedia,
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
    const routeHandler = ROUTES[action];

    if (!routeHandler) {
      return sendJson(res, 404, {
        ok: false,
        error: "unknown action",
        action,
      });
    }

    if (typeof routeHandler !== "function") {
      return sendJson(res, 500, {
        ok: false,
        error: "invalid handler",
      });
    }

    return await routeHandler(req, res);
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
    });
  }
}
