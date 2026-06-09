import { adminAuthExpiredMessage } from "@/lib/shop/adminAuth";

export type MetaPlatformConnectionStatus =
  | "connected"
  | "not_configured"
  | "error";

export type MetaPlatformConnection = {
  status: MetaPlatformConnectionStatus;
  accountName: string | null;
  error: string | null;
};

export type MetaConnectionStatusResponse = {
  platforms: {
    facebook: MetaPlatformConnection;
    instagram: MetaPlatformConnection;
    threads: MetaPlatformConnection;
  };
  checkedAt: string;
};

export async function fetchMetaConnectionStatus(
  token: string
): Promise<MetaConnectionStatusResponse> {
  const response = await fetch("/api/admin-shop?action=meta-status", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = (await response.json().catch(() => null)) as
    | (MetaConnectionStatusResponse & { error?: string })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (!response.ok || !data?.platforms) {
    throw new Error(data?.error || "無法檢查 Meta 平台連線狀態。");
  }

  return data;
}
