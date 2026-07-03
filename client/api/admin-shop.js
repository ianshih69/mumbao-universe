const loadFallback = () => import("../server/adminShop/fallback.js");
const loadWarehouseMedia = () => import("../server/adminShop/warehouseMedia.js");
const loadUsersRoles = () => import("../server/adminShop/usersRoles.js");

const ROUTES = {
  test: () => import("../server/adminShop/test.js"),
  "admin-login": loadFallback,
  "admin-refresh": loadFallback,
  "admin-bootstrap-super": loadFallback,
  "admin-bootstrap-status": loadFallback,
  "admin-session": loadFallback,
  "admin-users": loadUsersRoles,
  "admin-roles": loadUsersRoles,
  "admin-audit-logs": loadFallback,
  dashboard: loadFallback,
  orders: loadFallback,
  "order-items-export": loadFallback,
  order: loadFallback,
  "order-shipments": loadFallback,
  "create-shipment": loadFallback,
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

function resolveRouteHandler(mod) {
  if (typeof mod === "function") {
    return mod;
  }

  if (typeof mod?.default === "function") {
    return mod.default;
  }

  if (typeof mod?.default?.default === "function") {
    return mod.default.default;
  }

  if (typeof mod?.handler === "function") {
    return mod.handler;
  }

  return null;
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
    const routeHandler = resolveRouteHandler(mod);

    if (!routeHandler) {
      console.error("[admin-shop] invalid handler export", {
        action,
        moduleKeys: Object.keys(mod || {}),
        defaultType: typeof mod?.default,
        nestedDefaultType: typeof mod?.default?.default,
      });

      return sendJson(res, 500, {
        ok: false,
        error: "invalid_handler_export",
        action,
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
      message: err?.message,
    });
  }
}
