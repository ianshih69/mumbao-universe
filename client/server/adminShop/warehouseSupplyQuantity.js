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

async function handleWarehouseSupplyQuantity(req, res) {
  const coreModule = await import("./core.js");
  const handleWarehouseSupplyQuantityAction = resolveNamedExport(
    coreModule,
    "handleWarehouseSupplyQuantityAction"
  );

  if (!handleWarehouseSupplyQuantityAction) {
    console.error("[admin-shop-warehouse-supply-quantity] invalid core export", {
      action: req.query?.action,
      moduleKeys: Object.keys(coreModule || {}),
      defaultType: typeof coreModule?.default,
      defaultKeys:
        coreModule?.default && typeof coreModule.default === "object"
          ? Object.keys(coreModule.default)
          : [],
      namedType: typeof coreModule?.handleWarehouseSupplyQuantityAction,
    });

    return sendJson(res, 500, { error: "invalid_core_handler_export" });
  }

  return await handleWarehouseSupplyQuantityAction(req, res);
}

export default withHandlerSafety(handleWarehouseSupplyQuantity, {
  name: "admin-shop-warehouse-supply-quantity",
});
