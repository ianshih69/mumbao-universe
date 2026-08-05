export const auditLogTypes = {
  operations: "operations",
  security: "security",
};

export function normalizeAuditLogType(value) {
  return value === auditLogTypes.security ? auditLogTypes.security : auditLogTypes.operations;
}

function encodedIlike(value) {
  return encodeURIComponent(String(value || "").trim());
}

export function buildAdminAuditLogQueryParams({
  logType,
  actor,
  moduleName,
  actionName,
  date,
  nextDate,
}) {
  const normalizedType = normalizeAuditLogType(logType);
  const params = [];

  if (actor) {
    const value = encodedIlike(actor);
    params.push(`or=(actor_email.ilike.*${value}*,actor_name.ilike.*${value}*)`);
  }

  if (normalizedType === auditLogTypes.security) {
    params.push("module=eq.auth");
  } else if (moduleName && moduleName !== "all" && moduleName !== "auth") {
    params.push(`module=eq.${encodeURIComponent(moduleName)}`);
  } else {
    params.push("module=neq.auth");
  }

  if (actionName && actionName !== "all") {
    params.push(`action=eq.${encodeURIComponent(actionName)}`);
  }

  if (date) {
    params.push(`created_at=gte.${encodeURIComponent(`${date}T00:00:00.000Z`)}`);
    if (nextDate) params.push(`created_at=lt.${encodeURIComponent(`${nextDate}T00:00:00.000Z`)}`);
  }

  params.push("select=*");
  params.push("order=created_at.desc");
  return params;
}

export function buildLastSuccessfulAdminLoginQueryParams({ actor, date, nextDate } = {}) {
  const params = [
    "module=eq.auth",
    "action=eq.login",
    "target_type=eq.admin_profile",
  ];

  if (actor) {
    const value = encodedIlike(actor);
    params.push(`or=(actor_email.ilike.*${value}*,actor_name.ilike.*${value}*)`);
  }

  if (date) {
    params.push(`created_at=gte.${encodeURIComponent(`${date}T00:00:00.000Z`)}`);
    if (nextDate) params.push(`created_at=lt.${encodeURIComponent(`${nextDate}T00:00:00.000Z`)}`);
  }

  params.push("select=id,actor_name,actor_email,created_at");
  params.push("order=created_at.desc");
  params.push("limit=1");
  return params;
}
