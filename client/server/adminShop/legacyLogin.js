import { withHandlerSafety } from "./withHandlerSafety.js";

async function handleLegacyLogin(req, res) {
  const { handleLegacyLoginAction } = await import("./core.js");
  return await handleLegacyLoginAction(req, res);
}

export default withHandlerSafety(handleLegacyLogin, { name: "admin-shop-legacy-login" });
