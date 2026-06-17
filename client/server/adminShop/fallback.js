import { withHandlerSafety } from "./withHandlerSafety.js";

async function handleAdminShopFallback(req, res) {
  const { default: handleAdminShop } = await import("./core.js");
  return await handleAdminShop(req, res);
}

export default withHandlerSafety(handleAdminShopFallback, { name: "admin-shop-fallback" });
