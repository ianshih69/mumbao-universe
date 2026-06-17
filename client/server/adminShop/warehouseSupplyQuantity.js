export default async function handleWarehouseSupplyQuantity(req, res) {
  const { handleWarehouseSupplyQuantityAction } = await import("./core.js");
  return await handleWarehouseSupplyQuantityAction(req, res);
}
