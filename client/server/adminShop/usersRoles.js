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

async function handleUsersRoles(req, res) {
  const coreModule = await import("./core.js");
  const handleAdminUsersAction = resolveNamedExport(coreModule, "handleAdminUsersAction");

  if (!handleAdminUsersAction) {
    console.error("[admin-shop-users-roles] invalid core export", {
      action: req.query?.action,
      moduleKeys: Object.keys(coreModule || {}),
      defaultType: typeof coreModule?.default,
      defaultKeys:
        coreModule?.default && typeof coreModule.default === "object"
          ? Object.keys(coreModule.default)
          : [],
      namedType: typeof coreModule?.handleAdminUsersAction,
    });

    return sendJson(res, 500, { error: "invalid_core_handler_export" });
  }

  return await handleAdminUsersAction(req, res);
}

export default withHandlerSafety(handleUsersRoles, { name: "admin-shop-users-roles" });
