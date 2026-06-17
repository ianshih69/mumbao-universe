export default async function handleLegacyLogin(req, res) {
  const { handleLegacyLoginAction } = await import("./core.js");
  return await handleLegacyLoginAction(req, res);
}
