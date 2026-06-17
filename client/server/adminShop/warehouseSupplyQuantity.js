import { withHandlerSafety } from "./withHandlerSafety.js";

async function handleWarehouseSupplyQuantity(req, res) {
  const { handleWarehouseSupplyQuantityAction } = await import("./core.js");
  return await handleWarehouseSupplyQuantityAction(req, res);
}

export default withHandlerSafety(handleWarehouseSupplyQuantity, {
  name: "admin-shop-warehouse-supply-quantity",
});
