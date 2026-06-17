import { withHandlerSafety } from "./withHandlerSafety.js";

async function handleUsersRoles(req, res) {
  const { handleAdminUsersAction } = await import("./core.js");
  return await handleAdminUsersAction(req, res);
}

export default withHandlerSafety(handleUsersRoles, { name: "admin-shop-users-roles" });
