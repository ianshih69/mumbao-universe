import { withHandlerSafety } from "./withHandlerSafety.js";

function resolveNamedExport(moduleValue, exportName) {
  let current = moduleValue;
  const visited = new Set();

  for (let depth = 0; depth < 10; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) {
      return null;
    }

    visited.add(current);

    if (typeof current[exportName] === "function") {
      return current[exportName];
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

async function handleWarehouseMedia(req, res) {
  const action = String(
    Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action || ""
  ).trim();
  const coreModule = await import("./core.js");
  const exportName =
    action === "warehouse-media-upload"
      ? "handleWarehouseMediaUploadAction"
      : "handleWarehouseMediaAction";
  const routeHandler = resolveNamedExport(coreModule, exportName);

  if (!routeHandler) {
    console.error("[admin-shop-warehouse-media] invalid core export", {
      action,
      exportName,
      moduleKeys: Object.keys(coreModule || {}),
      defaultType: typeof coreModule?.default,
      defaultKeys:
        coreModule?.default && typeof coreModule.default === "object"
          ? Object.keys(coreModule.default)
          : [],
      namedType: typeof coreModule?.[exportName],
    });

    return sendJson(res, 500, { error: "invalid_core_handler_export" });
  }

  return await routeHandler(req, res);
}

export default withHandlerSafety(handleWarehouseMedia, { name: "admin-shop-warehouse-media" });
