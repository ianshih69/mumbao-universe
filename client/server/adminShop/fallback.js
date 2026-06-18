import { withHandlerSafety } from "./withHandlerSafety.js";

function resolveHandleAdminShop(moduleValue) {
  let current = moduleValue;
  const visited = new Set();

  for (let depth = 0; depth < 10; depth += 1) {
    if (typeof current === "function") {
      return current;
    }

    if (!current || typeof current !== "object" || visited.has(current)) {
      return null;
    }

    visited.add(current);

    if (typeof current.handleAdminShop === "function") {
      return current.handleAdminShop;
    }

    if (!("default" in current)) {
      return null;
    }

    current = current.default;
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
      defaultKeys:
        coreModule?.default && typeof coreModule.default === "object"
          ? Object.keys(coreModule.default)
          : [],
    });

    return sendJson(res, 500, {
      error: "invalid_core_handler_export",
    });
  }

  return await handleAdminShop(req, res);
}

export default withHandlerSafety(handleAdminShopFallback, { name: "admin-shop-fallback" });
