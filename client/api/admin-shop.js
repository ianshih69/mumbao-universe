const routeLoaders = {
  "admin-legacy-login": () => import("../server/adminShop/legacyLogin.js"),
  "warehouse-supply-quantity": () =>
    import("../server/adminShop/warehouseSupplyQuantity.js"),
  "warehouse-media-upload": () => import("../server/adminShop/warehouseMedia.js"),
  "warehouse-media": () => import("../server/adminShop/warehouseMedia.js"),
  "admin-users": () => import("../server/adminShop/usersRoles.js"),
};

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getAction(req) {
  return String(firstQueryValue(req.query?.action) || "").trim();
}

function loadRoute(action) {
  return routeLoaders[action] || (() => import("../server/adminShop/core.js"));
}

export default async function handler(req, res) {
  const action = getAction(req);

  try {
    const routeModule = await loadRoute(action)();
    const routeHandler = routeModule.default;

    if (typeof routeHandler !== "function") {
      return sendJson(res, 500, { error: "Admin shop route is not configured." });
    }

    return await routeHandler(req, res);
  } catch (error) {
    console.error("admin shop router error:", error);
    return sendJson(res, error.status || 500, {
      error:
        error.status === 401
          ? "Unauthorized."
          : error.status === 403
            ? "Permission denied."
            : error.status === 400 || error.status === 404 || error.status === 409
              ? error.message
            : "Admin shop request failed.",
    });
  }
}
