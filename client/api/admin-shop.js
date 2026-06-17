import { withHandlerSafety } from "../server/adminShop/withHandlerSafety.js";

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

function getAction(req) {
  return String(firstQueryValue(req.query?.action) || "").trim();
}

function loadRoute(action) {
  return routeLoaders[action] || (() => import("../server/adminShop/fallback.js"));
}

async function dispatchAdminShop(req, res) {
  const action = getAction(req);
  const routeModule = await loadRoute(action)();
  const routeHandler = routeModule.default;

  if (typeof routeHandler !== "function") {
    const error = new Error("Admin shop route is not configured.");
    error.status = 500;
    throw error;
  }

  return await routeHandler(req, res);
}

export default withHandlerSafety(dispatchAdminShop, { name: "admin-shop-router" });
