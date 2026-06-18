import { withHandlerSafety } from "./withHandlerSafety.js";

function resolveHandleAdminShop(mod) {
  if (typeof mod?.handleAdminShop === "function") {
    return mod.handleAdminShop;
  }

  if (typeof mod?.default?.handleAdminShop === "function") {
    return mod.default.handleAdminShop;
  }

  if (typeof mod?.default?.default?.handleAdminShop === "function") {
    return mod.default.default.handleAdminShop;
  }

  if (typeof mod?.default === "function") {
    return mod.default;
  }

  return null;
}

function sendJson(res, status, body) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(body);
  }

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(body));
}

async function handleAdminShopFallback(req, res) {
  const coreModule = await import("./core.js");
  const handleAdminShop = resolveHandleAdminShop(coreModule);

  if (!handleAdminShop) {
    console.error("[admin-shop-fallback] invalid core export", {
      moduleKeys: Object.keys(coreModule || {}),
      defaultType: typeof coreModule?.default,
      namedType: typeof coreModule?.handleAdminShop,
    });

    return sendJson(res, 500, {
      error: "invalid_core_handler_export",
    });
  }

  return await handleAdminShop(req, res);
}

export default withHandlerSafety(handleAdminShopFallback, { name: "admin-shop-fallback" });
