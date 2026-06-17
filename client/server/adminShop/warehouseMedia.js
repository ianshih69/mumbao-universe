import { withHandlerSafety } from "./withHandlerSafety.js";

async function handleWarehouseMedia(req, res) {
  const action = String(
    Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action || ""
  ).trim();
  const route = await import("./core.js");

  if (action === "warehouse-media-upload") {
    return await route.handleWarehouseMediaUploadAction(req, res);
  }

  return await route.handleWarehouseMediaAction(req, res);
}

export default withHandlerSafety(handleWarehouseMedia, { name: "admin-shop-warehouse-media" });
