export default async function handleUsersRoles(req, res) {
  const { handleAdminUsersAction } = await import("./core.js");
  return await handleAdminUsersAction(req, res);
}
