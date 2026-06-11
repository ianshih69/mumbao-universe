import { adminAuthExpiredMessage } from "@/lib/shop/adminAuth";

export type MetaPlatformConnectionStatus =
  | "connected"
  | "not_configured"
  | "error";

export type MetaPlatformConnection = {
  status: MetaPlatformConnectionStatus;
  accountName: string | null;
  error: string | null;
  errorCode: string | null;
  metaError?: {
    code: number | null;
    type: string | null;
    error_subcode: number | null;
    message: string | null;
  } | null;
  diagnostics?: {
    hasFacebookPageId?: boolean;
    facebookPageIdLength?: number;
    hasFacebookPageToken?: boolean;
    facebookPageTokenPrefix?: string;
    facebookPageTokenLength?: number;
    pageId?: string;
    pageName?: string;
    instagramBusinessAccountId?: string;
    hasInstagramBusinessAccount?: boolean;
    scopeCheckAvailable?: boolean;
    grantedScopes?: string[];
    requiredScopes?: string[];
    missingScopes?: string[];
    canPublishInstagram?: boolean;
    scopeCheckError?: string | null;
  };
};

export type MetaConnectionStatusResponse = {
  platforms: {
    facebook: MetaPlatformConnection;
    instagram: MetaPlatformConnection;
    threads: MetaPlatformConnection;
  };
  checkedAt: string;
};

export type FacebookPublishErrorDetails = {
  code: number | null;
  type: string | null;
  error_subcode: number | null;
};

export type FacebookPublishResult = {
  ok: true;
  facebookPostId: string;
  facebookPermalinkUrl: string | null;
  createdAt: string;
};

export type InstagramPublishResult = {
  ok: true;
  instagramMediaId: string;
  instagramPermalinkUrl: string | null;
  imageUrl: string;
  r2Key: string | null;
  createdAt: string;
};

export type ThreadsPublishResult = {
  ok: true;
  threadsMediaId: string;
  threadsPermalinkUrl: string | null;
  createdAt: string;
};

export type FacebookDeleteResult = {
  ok: true;
  taskId: string;
  facebookPostId: string;
  deletedAt: string;
};

export type FacebookSyncResult = {
  ok: true;
  taskId: string;
  status: "published" | "deleted";
  facebookPostId: string;
  facebookPermalinkUrl: string | null;
  lastSyncedAt: string;
  deletedAt: string | null;
  deleteSource: "facebook" | null;
};

export type MetaTokenExchangeResult = {
  ok: true;
  pageId: string;
  pageName: string;
  hasPageAccessToken: true;
  pageAccessTokenPrefix: string;
  pageAccessTokenLength: number;
  pageAccessToken: string;
  tasks: string[];
  expiresIn: number | null;
  exchangedAt: string;
};

export type FacebookTokenDebugResult = {
  ok: true;
  isValid: boolean;
  appId: string;
  type: string;
  application: string;
  profileId: string;
  userId: string;
  expiresAt: number | null;
  dataAccessExpiresAt: number | null;
  scopes: string[];
  tokenPrefix: string;
  tokenLength: number;
  checkedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
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

export async function fetchFacebookTokenDebug(
  token: string
): Promise<FacebookTokenDebugResult> {
  const response = await fetch(
    "/api/admin-shop?action=debug-facebook-token",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<FacebookTokenDebugResult> & {
        errorCode?: string;
        errorMessage?: string;
        metaError?: FacebookPublishErrorDetails | null;
      })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (!response.ok || !data?.ok) {
    const error = new Error(
      data?.errorMessage || "無法檢查 Facebook Token 健康狀態。"
    ) as Error & {
      errorCode?: string;
      metaError?: FacebookPublishErrorDetails | null;
    };
    error.errorCode = data?.errorCode;
    error.metaError = data?.metaError;
    throw error;
  }

  return {
    ok: true,
    isValid: data.isValid === true,
    appId: data.appId || "",
    type: data.type || "",
    application: data.application || "",
    profileId: data.profileId || "",
    userId: data.userId || "",
    expiresAt:
      typeof data.expiresAt === "number" ? data.expiresAt : null,
    dataAccessExpiresAt:
      typeof data.dataAccessExpiresAt === "number"
        ? data.dataAccessExpiresAt
        : null,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    tokenPrefix: data.tokenPrefix || "",
    tokenLength: Number(data.tokenLength || 0),
    checkedAt: data.checkedAt || new Date().toISOString(),
    errorCode: data.errorCode || null,
    errorMessage: data.errorMessage || null,
  };
}

export async function publishFacebookPost(
  token: string,
  taskId: string,
  content: string,
  hashtags: string
): Promise<FacebookPublishResult> {
  const response = await fetch(
    "/api/admin-shop?action=publish-facebook-post",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        taskId,
        content,
        hashtags,
      }),
    }
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<FacebookPublishResult> & {
        errorCode?: string;
        errorMessage?: string;
        metaError?: FacebookPublishErrorDetails | null;
      })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (!response.ok || !data?.ok || !data.facebookPostId || !data.createdAt) {
    const error = new Error(
      data?.errorMessage || "Facebook 發文失敗，請稍後再試。"
    ) as Error & {
      errorCode?: string;
      metaError?: FacebookPublishErrorDetails | null;
    };
    error.errorCode = data?.errorCode;
    error.metaError = data?.metaError;
    throw error;
  }

  return {
    ok: true,
    facebookPostId: data.facebookPostId,
    facebookPermalinkUrl: data.facebookPermalinkUrl || null,
    createdAt: data.createdAt,
  };
}

export async function publishInstagramPost(
  token: string,
  taskId: string,
  imageUrl: string,
  r2Key: string,
  title: string,
  content: string,
  hashtags: string
): Promise<InstagramPublishResult> {
  const response = await fetch(
    "/api/admin-shop?action=publish-instagram-post",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        taskId,
        imageUrl,
        r2Key,
        title,
        content,
        hashtags,
      }),
    }
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<InstagramPublishResult> & {
        errorCode?: string;
        errorMessage?: string;
        metaError?: FacebookPublishErrorDetails | null;
      })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (
    !response.ok ||
    !data?.ok ||
    !data.instagramMediaId ||
    !data.createdAt
  ) {
    const error = new Error(
      data?.errorMessage || "Instagram 發文失敗，請稍後再試。"
    ) as Error & {
      errorCode?: string;
      metaError?: FacebookPublishErrorDetails | null;
    };
    error.errorCode = data?.errorCode;
    error.metaError = data?.metaError;
    throw error;
  }

  return {
    ok: true,
    instagramMediaId: data.instagramMediaId,
    instagramPermalinkUrl: data.instagramPermalinkUrl || null,
    imageUrl: data.imageUrl || imageUrl,
    r2Key: data.r2Key || r2Key || null,
    createdAt: data.createdAt,
  };
}

export async function publishThreadsPost(
  token: string,
  taskId: string,
  title: string,
  content: string,
  hashtags: string
): Promise<ThreadsPublishResult> {
  const response = await fetch(
    "/api/admin-shop?action=publish-threads-post",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        taskId,
        title,
        content,
        hashtags,
      }),
    }
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<ThreadsPublishResult> & {
        errorCode?: string;
        errorMessage?: string;
        metaError?: FacebookPublishErrorDetails | null;
      })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (
    !response.ok ||
    !data?.ok ||
    !data.threadsMediaId ||
    !data.createdAt
  ) {
    const error = new Error(
      data?.errorMessage || "Threads 發文失敗，請稍後再試。"
    ) as Error & {
      errorCode?: string;
      metaError?: FacebookPublishErrorDetails | null;
    };
    error.errorCode = data?.errorCode;
    error.metaError = data?.metaError;
    throw error;
  }

  return {
    ok: true,
    threadsMediaId: data.threadsMediaId,
    threadsPermalinkUrl: data.threadsPermalinkUrl || null,
    createdAt: data.createdAt,
  };
}

export async function syncSocialPosts(
  token: string,
  tasks: unknown[]
): Promise<void> {
  const response = await fetch(
    "/api/admin-shop?action=social-posts-sync",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ tasks }),
    }
  );
  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "發文任務同步失敗。");
  }
}

export async function fetchSocialPosts<T>(token: string): Promise<T[]> {
  const response = await fetch("/api/admin-shop?action=social-posts", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = (await response.json().catch(() => null)) as
    | { posts?: T[]; error?: string }
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }
  if (!response.ok || !Array.isArray(data?.posts)) {
    throw new Error(data?.error || "無法讀取發文任務。");
  }

  return data.posts;
}

export async function syncFacebookPostStatus(
  token: string,
  taskId: string
): Promise<FacebookSyncResult> {
  const response = await fetch(
    "/api/admin-shop?action=sync-facebook-post",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ taskId }),
    }
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<FacebookSyncResult> & {
        errorCode?: string;
        errorMessage?: string;
      })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }
  if (
    !response.ok ||
    !data?.ok ||
    !data.taskId ||
    !data.facebookPostId ||
    !data.lastSyncedAt ||
    (data.status !== "published" && data.status !== "deleted")
  ) {
    throw new Error(
      data?.errorMessage || "Facebook 狀態同步失敗，請稍後再試。"
    );
  }

  return {
    ok: true,
    taskId: data.taskId,
    status: data.status,
    facebookPostId: data.facebookPostId,
    facebookPermalinkUrl: data.facebookPermalinkUrl || null,
    lastSyncedAt: data.lastSyncedAt,
    deletedAt: data.deletedAt || null,
    deleteSource: data.deleteSource === "facebook" ? "facebook" : null,
  };
}

export async function deleteFacebookPost(
  token: string,
  taskId: string,
  facebookPostId: string
): Promise<FacebookDeleteResult> {
  const response = await fetch(
    "/api/admin-shop?action=delete-facebook-post",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        taskId,
        status: "published",
        facebookPostId,
      }),
    }
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<FacebookDeleteResult> & {
        errorCode?: string;
        errorMessage?: string;
        metaError?: FacebookPublishErrorDetails | null;
      })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (
    !response.ok ||
    !data?.ok ||
    !data.taskId ||
    !data.facebookPostId ||
    !data.deletedAt
  ) {
    const error = new Error(
      data?.errorMessage || "Facebook 貼文刪除失敗，請稍後再試。"
    ) as Error & {
      errorCode?: string;
      metaError?: FacebookPublishErrorDetails | null;
    };
    error.errorCode = data?.errorCode;
    error.metaError = data?.metaError;
    throw error;
  }

  return {
    ok: true,
    taskId: data.taskId,
    facebookPostId: data.facebookPostId,
    deletedAt: data.deletedAt,
  };
}

export async function exchangeMetaToken(
  token: string,
  shortLivedUserToken: string
): Promise<MetaTokenExchangeResult> {
  const response = await fetch(
    "/api/admin-shop?action=exchange-meta-token",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ shortLivedUserToken }),
    }
  );
  const data = (await response.json().catch(() => null)) as
    | (Partial<MetaTokenExchangeResult> & {
        errorCode?: string;
        errorMessage?: string;
        metaError?: FacebookPublishErrorDetails | null;
      })
    | null;

  if (response.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (
    !response.ok ||
    !data?.ok ||
    !data.pageId ||
    !data.pageAccessToken
  ) {
    const error = new Error(
      data?.errorMessage || "Meta Token 交換失敗，請稍後再試。"
    ) as Error & {
      errorCode?: string;
      metaError?: FacebookPublishErrorDetails | null;
    };
    error.errorCode = data?.errorCode;
    error.metaError = data?.metaError;
    throw error;
  }

  return {
    ok: true,
    pageId: data.pageId,
    pageName: data.pageName || "Facebook 粉絲專頁",
    hasPageAccessToken: true,
    pageAccessTokenPrefix: data.pageAccessTokenPrefix || "",
    pageAccessTokenLength: Number(data.pageAccessTokenLength || 0),
    pageAccessToken: data.pageAccessToken,
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    expiresIn:
      typeof data.expiresIn === "number" ? data.expiresIn : null,
    exchangedAt: data.exchangedAt || new Date().toISOString(),
  };
}
