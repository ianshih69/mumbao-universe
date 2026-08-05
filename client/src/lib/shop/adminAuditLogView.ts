export type AdminAuditLogType = "operations" | "security";

type AuditLogSummaryInput = {
  action: string;
  module: string;
  target_type?: string | null;
  description?: string | null;
};

export const auditLogTypeOptions: Array<{ value: AdminAuditLogType; label: string }> = [
  { value: "operations", label: "一般操作" },
  { value: "security", label: "登入安全" },
];

const operationModuleOptions = [
  { value: "all", label: "全部" },
  { value: "booking", label: "房況與訂房" },
  { value: "orders", label: "商城訂單" },
  { value: "products", label: "商品" },
  { value: "inventory", label: "庫存" },
  { value: "warehouse", label: "倉儲與資產" },
  { value: "pos", label: "現場銷售" },
  { value: "users", label: "後台使用者" },
  { value: "members", label: "會員" },
  { value: "audit_logs", label: "操作紀錄" },
];

const securityModuleOptions = [
  { value: "all", label: "全部" },
  { value: "auth", label: "登入安全" },
];

const operationActionOptions = [
  { value: "all", label: "全部" },
  { value: "create", label: "新增" },
  { value: "update", label: "編輯" },
  { value: "delete", label: "刪除" },
  { value: "delete_audit_log", label: "刪除操作紀錄" },
  { value: "delete_audit_logs", label: "批次刪除操作紀錄" },
  { value: "adjust_quantity", label: "數量調整" },
  { value: "complete_booking_stay", label: "確認完成住宿" },
  { value: "update_customer_member_level", label: "修改會員等級" },
  { value: "update_customer_member_admin_note", label: "修改會員備註" },
  { value: "update_customer_member_diamond_profile", label: "修改鑽石會員資料" },
  { value: "adjust_customer_member_points", label: "調整會員積分" },
  { value: "complete_member_points_redemption", label: "完成積分兌換" },
  { value: "reject_member_points_redemption", label: "退回積分兌換" },
  { value: "create_external_reservation", label: "建立外部訂房" },
  { value: "sync_booking_ical", label: "同步訂房日曆" },
  { value: "update_ical_setting", label: "修改日曆同步設定" },
  { value: "orders.shipment_create", label: "建立出貨紀錄" },
];

const securityActionOptions = [
  { value: "all", label: "全部" },
  { value: "login", label: "登入成功" },
  { value: "login_failed", label: "登入失敗" },
  { value: "logout", label: "登出" },
  { value: "session_expired", label: "工作階段失效" },
];

export function getAuditLogModuleOptions(type: AdminAuditLogType) {
  return type === "security" ? securityModuleOptions : operationModuleOptions;
}

export function getAuditLogActionOptions(type: AdminAuditLogType) {
  return type === "security" ? securityActionOptions : operationActionOptions;
}

export function formatAuditLogSummary(log: AuditLogSummaryInput) {
  if (log.module === "auth") {
    if (log.action === "login") return "管理員登入成功";
    if (log.action === "login_failed" || log.action === "failed_login" || log.action === "login_failure") {
      return "管理員登入失敗";
    }
    if (log.action === "logout") return "管理員登出";
    if (log.action === "session_expired" || log.action === "session_invalidated") {
      return "管理員工作階段失效";
    }
  }

  return log.description || `${log.module}.${log.action}`;
}
