import { readBody, sendJson, supabaseRpc } from "./_shop_shared.js";

const knownOrderErrors = new Map([
  ["ORDER_ITEMS_REQUIRED", "購物車目前沒有商品。"],
  ["CUSTOMER_NAME_REQUIRED", "請填寫收件人姓名。"],
  ["CUSTOMER_PHONE_REQUIRED", "請填寫聯絡電話。"],
  ["SHIPPING_ADDRESS_REQUIRED", "請填寫收件地址。"],
  ["INVALID_QUANTITY", "商品數量不正確。"],
  ["VARIANT_NOT_FOUND", "部分商品規格已下架，請重新整理購物車。"],
  ["PRODUCT_NOT_AVAILABLE", "部分商品目前無法購買，請重新整理購物車。"],
  ["INSUFFICIENT_INVENTORY", "部分商品庫存不足，請調整數量。"],
]);

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      variant_id: String(item?.variant_id || item?.variantId || "").trim(),
      quantity: Number.parseInt(String(item?.quantity || ""), 10),
    }))
    .filter((item) => item.variant_id && Number.isFinite(item.quantity));
}

function getKnownErrorMessage(error) {
  const message = String(error?.details?.message || error?.message || "");
  const matchedKey = Array.from(knownOrderErrors.keys()).find((key) =>
    message.includes(key)
  );

  return matchedKey ? knownOrderErrors.get(matchedKey) : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readBody(req);
    const customer = {
      name: String(body?.customer?.name || "").trim(),
      phone: String(body?.customer?.phone || "").trim(),
      email: String(body?.customer?.email || "").trim(),
      address: String(body?.customer?.address || "").trim(),
    };
    const payload = {
      customer,
      note: String(body?.note || "").trim(),
      items: normalizeItems(body?.items),
    };

    if (!payload.items.length) {
      return sendJson(res, 400, { error: "購物車目前沒有商品。" });
    }

    const order = await supabaseRpc("create_shop_order", {
      order_payload: payload,
    });

    return sendJson(res, 201, { order });
  } catch (error) {
    const knownErrorMessage = getKnownErrorMessage(error);
    if (knownErrorMessage) {
      return sendJson(res, 409, { error: knownErrorMessage });
    }

    console.error("shop create order error:", error);
    return sendJson(res, 500, { error: "Failed to create order." });
  }
}
