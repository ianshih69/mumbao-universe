import {
  ChangeEvent,
  Fragment,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileImage,
  KeyRound,
  LockKeyhole,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import AdminShopNav from "@/components/shop/AdminShopNav";
import { Button } from "@/components/ui/button";
import { getAdminToken } from "@/lib/shop/adminAuth";
import {
  deleteFacebookPost,
  exchangeMetaToken,
  fetchFacebookTokenDebug,
  fetchMetaConnectionStatus,
  fetchSocialPosts,
  publishFacebookPost,
  syncFacebookPostStatus,
  syncSocialPosts,
  type FacebookTokenDebugResult,
  type FacebookPublishErrorDetails,
  type MetaPlatformConnection,
  type MetaTokenExchangeResult,
} from "@/lib/shop/metaConnectionApi";
import {
  type SocialMediaFile,
  uploadSocialMediaFile,
} from "@/lib/shop/socialUploadApi";
import { cn } from "@/lib/utils";

const legacySocialDraftStorageKey = "mumbao_social_post_draft";
const socialDraftsStorageKey = "mumbao_social_post_drafts";

type PublishMode = "now" | "scheduled";
type Platform = "Facebook" | "Instagram" | "Threads";
type DraftStatus =
  | "pending"
  | "scheduled"
  | "published"
  | "deleted"
  | "partial_success"
  | "failed"
  | "cancelled";

type MetaPlatformKey = "facebook" | "instagram" | "threads";
type TaskFilter =
  | "all"
  | "draft"
  | "published"
  | "deleted"
  | "failed"
  | "facebook"
  | "instagram"
  | "threads";
type MetaConnectionUiStatus = MetaPlatformConnection | {
  status: "checking";
  accountName: null;
  error: null;
  errorCode: null;
  metaError: null;
};

type SocialDraftForm = {
  title: string;
  content: string;
  hashtags: string;
  platforms: Platform[];
  publishMode: PublishMode;
  scheduledAt: string;
  fileNames: string[];
  mediaFiles: SocialMediaFile[];
};

type StoredSocialDraft = {
  id: string;
  title: string;
  content: string;
  hashtags: string;
  platforms: Platform[];
  mode: PublishMode;
  scheduledAt: string;
  status: DraftStatus;
  mediaFileNames: string[];
  mediaFiles: SocialMediaFile[];
  publishedAt?: string;
  facebookPostId?: string;
  facebookPermalinkUrl?: string;
  deletedAt?: string;
  deleteSource?: "admin" | "facebook" | "api";
  lastSyncedAt?: string;
  publishError?: {
    errorCode: string;
    errorMessage: string;
    metaError: FacebookPublishErrorDetails | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

const defaultDraft: SocialDraftForm = {
  title: "",
  content: "",
  hashtags: "",
  platforms: ["Facebook", "Instagram"],
  publishMode: "now",
  scheduledAt: "",
  fileNames: [],
  mediaFiles: [],
};

const initialMetaConnections: Record<
  MetaPlatformKey,
  MetaConnectionUiStatus
> = {
  facebook: {
    status: "checking",
    accountName: null,
    error: null,
    errorCode: null,
    metaError: null,
  },
  instagram: {
    status: "checking",
    accountName: null,
    error: null,
    errorCode: null,
    metaError: null,
  },
  threads: {
    status: "checking",
    accountName: null,
    error: null,
    errorCode: null,
    metaError: null,
  },
};

function createDraftId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `social-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDraftStatus(mode: PublishMode, scheduledAt: string): DraftStatus {
  return mode === "scheduled" && scheduledAt ? "scheduled" : "pending";
}

function formFromStoredDraft(draft: StoredSocialDraft): SocialDraftForm {
  return {
    title: draft.title || "",
    content: draft.content || "",
    hashtags: draft.hashtags || "",
    platforms: draft.platforms?.length ? draft.platforms : [],
    publishMode: draft.mode || "now",
    scheduledAt: draft.scheduledAt || "",
    fileNames: draft.mediaFileNames || [],
    mediaFiles: draft.mediaFiles || [],
  };
}

function storedDraftFromForm(
  form: SocialDraftForm,
  existingDraft?: StoredSocialDraft
): StoredSocialDraft {
  const now = new Date().toISOString();

  return {
    id: existingDraft?.id || createDraftId(),
    title: form.title.trim(),
    content: form.content.trim(),
    hashtags: form.hashtags.trim(),
    platforms: form.platforms,
    mode: form.publishMode,
    scheduledAt: form.scheduledAt,
    status: getDraftStatus(form.publishMode, form.scheduledAt),
    mediaFileNames: form.fileNames,
    mediaFiles: form.mediaFiles,
    publishedAt: existingDraft?.publishedAt,
    facebookPostId: existingDraft?.facebookPostId,
    facebookPermalinkUrl: existingDraft?.facebookPermalinkUrl,
    deletedAt: existingDraft?.deletedAt,
    deleteSource: existingDraft?.deleteSource,
    lastSyncedAt: existingDraft?.lastSyncedAt,
    publishError: existingDraft?.publishError || null,
    createdAt: existingDraft?.createdAt || now,
    updatedAt: now,
  };
}

function normalizeStoredDraft(value: unknown): StoredSocialDraft | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Partial<StoredSocialDraft> & {
    publishMode?: PublishMode;
    fileNames?: string[];
    status?: DraftStatus | "draft";
  };
  const mode = source.mode || source.publishMode || "now";
  const scheduledAt = source.scheduledAt || "";
  const now = new Date().toISOString();

  return {
    id: source.id || createDraftId(),
    title: source.title || "",
    content: source.content || "",
    hashtags: source.hashtags || "",
    platforms: Array.isArray(source.platforms) ? (source.platforms as Platform[]) : [],
    mode,
    scheduledAt,
    status:
      source.status === "draft"
        ? "pending"
        : source.status || getDraftStatus(mode, scheduledAt),
    mediaFileNames: source.mediaFileNames || source.fileNames || [],
    mediaFiles: Array.isArray(source.mediaFiles) ? source.mediaFiles : [],
    publishedAt: source.publishedAt || undefined,
    facebookPostId: source.facebookPostId || undefined,
    facebookPermalinkUrl: source.facebookPermalinkUrl || undefined,
    deletedAt: source.deletedAt || undefined,
    deleteSource: source.deleteSource || undefined,
    lastSyncedAt: source.lastSyncedAt || undefined,
    publishError: source.publishError || null,
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now,
  };
}

function loadStoredDrafts(): StoredSocialDraft[] {
  try {
    const rawDrafts = localStorage.getItem(socialDraftsStorageKey);

    if (rawDrafts) {
      const parsed = JSON.parse(rawDrafts);
      const sourceDrafts = Array.isArray(parsed) ? parsed : [parsed];
      const seenIds = new Set<string>();
      let repaired = !Array.isArray(parsed);
      const drafts = sourceDrafts.flatMap((value) => {
        const sourceId =
          value && typeof value === "object" && "id" in value
            ? String((value as { id?: unknown }).id || "").trim()
            : "";
        const normalized = normalizeStoredDraft(value);
        if (!normalized) {
          repaired = true;
          return [];
        }

        if (!sourceId || seenIds.has(normalized.id)) {
          normalized.id = createDraftId();
          repaired = true;
        }

        seenIds.add(normalized.id);
        return [normalized];
      });

      if (repaired) {
        localStorage.setItem(socialDraftsStorageKey, JSON.stringify(drafts));
      }

      return drafts;
    }

    const legacyDraft = localStorage.getItem(legacySocialDraftStorageKey);
    if (!legacyDraft) return [];

    const migratedDraft = normalizeStoredDraft(JSON.parse(legacyDraft));
    if (!migratedDraft) return [];

    localStorage.setItem(socialDraftsStorageKey, JSON.stringify([migratedDraft]));
    localStorage.removeItem(legacySocialDraftStorageKey);

    return [migratedDraft];
  } catch {
    return [];
  }
}

function saveStoredDrafts(drafts: StoredSocialDraft[]) {
  localStorage.setItem(socialDraftsStorageKey, JSON.stringify(drafts));
}

function getInitialSocialState() {
  const drafts = loadStoredDrafts();

  return {
    drafts,
    activeDraftId: null,
    form: defaultDraft,
  };
}

function formatDateTime(value?: string) {
  if (!value) return "未排程";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatUnixTime(value: number | null) {
  if (!value) return "";
  return formatDateTime(new Date(value * 1000).toISOString());
}

function getRemainingDays(value: number | null) {
  if (!value) return null;

  const difference = value * 1000 - Date.now();
  const dayMilliseconds = 24 * 60 * 60 * 1000;

  return difference >= 0
    ? Math.ceil(difference / dayMilliseconds)
    : -Math.ceil(Math.abs(difference) / dayMilliseconds);
}

function getExpiryDayLabel(value: number | null, subject: string) {
  const remainingDays = getRemainingDays(value);
  if (remainingDays === null) return "";
  if (remainingDays < 0) {
    return `${subject}已過期 ${Math.abs(remainingDays)} 天`;
  }
  if (remainingDays === 0) return `${subject}今天到期`;
  return `${subject}剩餘 ${remainingDays} 天`;
}

function getFacebookTokenHealth(debug: FacebookTokenDebugResult) {
  const dataAccessDays = getRemainingDays(debug.dataAccessExpiresAt);
  const tokenDays = getRemainingDays(debug.expiresAt);

  if (!debug.isValid) {
    return {
      level: "error" as const,
      message:
        "Facebook Token 已無效，可能導致自動發文失敗，請重新產生長效 Page Token 並更新 Vercel。",
    };
  }

  if (dataAccessDays !== null && dataAccessDays <= 0) {
    return {
      level: "error" as const,
      message:
        "Facebook Token 資料存取權限已到期，可能導致自動發文失敗，請重新產生長效 Page Token 並更新 Vercel。",
    };
  }

  if (tokenDays !== null && tokenDays <= 0) {
    return {
      level: "error" as const,
      message:
        "Facebook Token 已到期，可能導致自動發文失敗，請重新產生長效 Page Token 並更新 Vercel。",
    };
  }

  if (dataAccessDays !== null && dataAccessDays <= 7) {
    return {
      level: "warning" as const,
      message:
        "Facebook Token 資料存取權限即將到期，建議盡快重新產生長效 Page Token，並更新 Vercel 的 FACEBOOK_PAGE_ACCESS_TOKEN。",
    };
  }

  if (tokenDays !== null && tokenDays <= 7) {
    return {
      level: "warning" as const,
      message:
        "Facebook Token 即將到期，建議盡快重新產生長效 Page Token，並更新 Vercel 的 FACEBOOK_PAGE_ACCESS_TOKEN。",
    };
  }

  return {
    level: "normal" as const,
    message: "Token 狀態正常。",
  };
}

function getModeLabel(mode: PublishMode) {
  return mode === "scheduled" ? "排程發文" : "立即發文";
}

function getStatusLabel(status: DraftStatus) {
  const labels: Record<DraftStatus, string> = {
    pending: "草稿",
    scheduled: "排程中",
    published: "已發布",
    deleted: "已刪除",
    partial_success: "部分成功",
    failed: "發文失敗",
    cancelled: "已取消",
  };

  return labels[status] || "待發文";
}

function getTaskStatusClasses(status: DraftStatus) {
  if (status === "published") return "bg-emerald-50 text-emerald-700";
  if (status === "deleted") return "bg-red-50 text-red-700";
  if (status === "failed") return "bg-orange-50 text-orange-700";
  if (status === "scheduled") return "bg-sky-50 text-sky-700";
  return "bg-stone-100 text-stone-600";
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getMetaStatusLabel(status: MetaConnectionUiStatus["status"]) {
  const labels = {
    checking: "檢查中",
    connected: "已連線",
    not_configured: "未設定",
    error: "錯誤",
  };

  return labels[status];
}

function getMetaStatusClasses(status: MetaConnectionUiStatus["status"]) {
  if (status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "checking") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-stone-200 bg-stone-100 text-stone-600";
}

function validateMediaFile(file: File) {
  const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
  ]);

  if (!allowedTypes.has(file.type)) {
    return "不支援此檔案類型，僅接受 JPG、PNG、WebP 與 MP4。";
  }

  const maxSize = file.type === "video/mp4" ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return file.type === "video/mp4"
      ? "影片檔案不可超過 100MB。"
      : "圖片檔案不可超過 10MB。";
  }

  return "";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold text-stone-800">{children}</span>;
}

function EmptyPreviewLine({ children }: { children: React.ReactNode }) {
  return <span className="text-stone-400">{children}</span>;
}

export default function AdminShopSocial() {
  const [token] = useState(() => getAdminToken());
  const [initialState] = useState(() => getInitialSocialState());
  const [draft, setDraft] = useState<SocialDraftForm>(initialState.form);
  const [preview, setPreview] = useState<SocialDraftForm>(initialState.form);
  const [savedDrafts, setSavedDrafts] = useState<StoredSocialDraft[]>(
    initialState.drafts
  );
  const [editingDraftId, setEditingDraftId] = useState<string | null>(
    initialState.activeDraftId
  );
  const [notice, setNotice] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [metaConnections, setMetaConnections] = useState(initialMetaConnections);
  const [expandedMetaPlatform, setExpandedMetaPlatform] =
    useState<MetaPlatformKey | null>(null);
  const [isMetaDetailsExpanded, setIsMetaDetailsExpanded] = useState(false);
  const [isMetaTokenHelperExpanded, setIsMetaTokenHelperExpanded] =
    useState(false);
  const [metaCheckedAt, setMetaCheckedAt] = useState("");
  const [metaCheckError, setMetaCheckError] = useState("");
  const [isCheckingMeta, setIsCheckingMeta] = useState(true);
  const [facebookTokenDebug, setFacebookTokenDebug] =
    useState<FacebookTokenDebugResult | null>(null);
  const [facebookTokenDebugError, setFacebookTokenDebugError] = useState<{
    code: string;
    message: string;
    metaError: FacebookPublishErrorDetails | null;
  } | null>(null);
  const [isCheckingFacebookToken, setIsCheckingFacebookToken] =
    useState(true);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(
    null
  );
  const [deletingFacebookDraftId, setDeletingFacebookDraftId] = useState<
    string | null
  >(null);
  const [syncingFacebookDraftId, setSyncingFacebookDraftId] = useState<
    string | null
  >(null);
  const [facebookDeleteTarget, setFacebookDeleteTarget] =
    useState<StoredSocialDraft | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const [shortLivedUserToken, setShortLivedUserToken] = useState("");
  const [isExchangingMetaToken, setIsExchangingMetaToken] = useState(false);
  const [metaTokenResult, setMetaTokenResult] =
    useState<MetaTokenExchangeResult | null>(null);
  const [metaTokenError, setMetaTokenError] = useState<{
    code: string;
    message: string;
    metaError: FacebookPublishErrorDetails | null;
  } | null>(null);
  const [isPageTokenVisible, setIsPageTokenVisible] = useState(false);
  const [pageTokenCopied, setPageTokenCopied] = useState(false);

  const platformOptions: Platform[] = useMemo(
    () => ["Facebook", "Instagram", "Threads"],
    []
  );

  const sortedDrafts = useMemo(
    () => [...savedDrafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedDrafts]
  );
  const visibleDrafts = useMemo(() => {
    const filtered = sortedDrafts.filter((item) => {
      if (taskFilter === "all") return true;
      if (taskFilter === "draft") return item.status === "pending";
      if (taskFilter === "published") return item.status === "published";
      if (taskFilter === "deleted") return item.status === "deleted";
      if (taskFilter === "failed") return item.status === "failed";

      const platform =
        taskFilter === "facebook"
          ? "Facebook"
          : taskFilter === "instagram"
            ? "Instagram"
            : "Threads";
      return item.platforms.includes(platform);
    });

    return filtered.slice(0, 100);
  }, [sortedDrafts, taskFilter]);

  const persistDrafts = (nextDrafts: StoredSocialDraft[]) => {
    saveStoredDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    void syncSocialPosts(token, nextDrafts).catch((error) => {
      setNotice(
        error instanceof Error
          ? `任務已保存在此瀏覽器，但資料庫同步失敗：${error.message}`
          : "任務已保存在此瀏覽器，但資料庫同步失敗。"
      );
    });
  };

  useEffect(() => {
    if (!token) return;

    void fetchSocialPosts<StoredSocialDraft>(token)
      .then((serverPosts) => {
        const postsById = new Map<string, StoredSocialDraft>();
        for (const post of [...initialState.drafts, ...serverPosts]) {
          const normalized = normalizeStoredDraft(post);
          if (!normalized) continue;
          const existing = postsById.get(normalized.id);
          if (
            !existing ||
            normalized.updatedAt.localeCompare(existing.updatedAt) > 0
          ) {
            postsById.set(normalized.id, normalized);
          }
        }

        const mergedPosts = Array.from(postsById.values());
        saveStoredDrafts(mergedPosts);
        setSavedDrafts(mergedPosts);
        if (mergedPosts.length) {
          void syncSocialPosts(token, mergedPosts);
        }
      })
      .catch(() => {
        if (initialState.drafts.length) {
          void syncSocialPosts(token, initialState.drafts).catch(() => {
            // Migration 尚未執行時，仍保留原本 localStorage 操作。
          });
        }
      });
  }, [initialState.drafts, token]);

  const checkMetaConnections = useCallback(async () => {
    if (!token) return;

    setIsCheckingMeta(true);
    setMetaCheckError("");
    setMetaConnections(initialMetaConnections);

    try {
      const result = await fetchMetaConnectionStatus(token);
      setMetaConnections(result.platforms);
      setMetaCheckedAt(result.checkedAt);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "無法檢查 Meta 平台連線狀態。";
      const failedStatus: MetaConnectionUiStatus = {
        status: "error",
        accountName: null,
        error: message,
        errorCode: "META_STATUS_REQUEST_FAILED",
        metaError: null,
      };

      setMetaConnections({
        facebook: failedStatus,
        instagram: failedStatus,
        threads: failedStatus,
      });
      setMetaCheckError(message);
      setMetaCheckedAt(new Date().toISOString());
    } finally {
      setIsCheckingMeta(false);
    }
  }, [token]);

  const checkFacebookTokenHealth = useCallback(async () => {
    if (!token) return;

    setIsCheckingFacebookToken(true);
    setFacebookTokenDebugError(null);

    try {
      const result = await fetchFacebookTokenDebug(token);
      setFacebookTokenDebug(result);
    } catch (error) {
      const debugError = error as Error & {
        errorCode?: string;
        metaError?: FacebookPublishErrorDetails | null;
      };

      setFacebookTokenDebug(null);
      setFacebookTokenDebugError({
        code: debugError.errorCode || "FACEBOOK_TOKEN_DEBUG_FAILED",
        message:
          debugError.message ||
          "無法檢查 Facebook Token 健康狀態。",
        metaError: debugError.metaError || null,
      });
    } finally {
      setIsCheckingFacebookToken(false);
    }
  }, [token]);

  const refreshMetaConnections = useCallback(() => {
    void checkMetaConnections();
    void checkFacebookTokenHealth();
  }, [checkFacebookTokenHealth, checkMetaConnections]);

  useEffect(() => {
    refreshMetaConnections();
  }, [refreshMetaConnections]);

  const handleMetaTokenExchange = async (event: FormEvent) => {
    event.preventDefault();

    const submittedToken = shortLivedUserToken.trim();
    if (!submittedToken) {
      setMetaTokenError({
        code: "SHORT_LIVED_USER_TOKEN_REQUIRED",
        message: "請貼上 Graph API Explorer 產生的短效 User Token。",
        metaError: null,
      });
      return;
    }

    setShortLivedUserToken("");
    setIsExchangingMetaToken(true);
    setMetaTokenResult(null);
    setMetaTokenError(null);
    setIsPageTokenVisible(false);
    setPageTokenCopied(false);

    try {
      const result = await exchangeMetaToken(token, submittedToken);
      setMetaTokenResult(result);
    } catch (error) {
      const exchangeError = error as Error & {
        errorCode?: string;
        metaError?: FacebookPublishErrorDetails | null;
      };
      setMetaTokenError({
        code: exchangeError.errorCode || "META_TOKEN_EXCHANGE_FAILED",
        message:
          exchangeError.message || "Meta Token 交換失敗，請稍後再試。",
        metaError: exchangeError.metaError || null,
      });
    } finally {
      setIsExchangingMetaToken(false);
    }
  };

  const revealPageAccessTokenOnce = () => {
    if (!metaTokenResult || isPageTokenVisible) return;

    const confirmed = window.confirm(
      "確定要顯示完整 Page Access Token 嗎？請確認目前畫面不會被他人看到，也不要截圖或分享。"
    );
    if (confirmed) {
      setIsPageTokenVisible(true);
    }
  };

  const copyPageAccessToken = async () => {
    if (!metaTokenResult) return;

    const confirmed = window.confirm(
      "確定要複製 Page Access Token 嗎？複製後請立即貼到 Vercel Environment Variables，並避免貼到聊天、Email 或公開文件。"
    );
    if (!confirmed) return;

    try {
      await navigator.clipboard.writeText(metaTokenResult.pageAccessToken);
      setPageTokenCopied(true);
    } catch {
      setMetaTokenError({
        code: "CLIPBOARD_WRITE_FAILED",
        message:
          "瀏覽器無法寫入剪貼簿。請使用「顯示一次」後手動複製。",
        metaError: null,
      });
    }
  };

  const clearMetaTokenResult = () => {
    setMetaTokenResult(null);
    setMetaTokenError(null);
    setIsPageTokenVisible(false);
    setPageTokenCopied(false);
    setShortLivedUserToken("");
  };

  const updateDraft = <K extends keyof SocialDraftForm>(
    key: K,
    value: SocialDraftForm[K]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const togglePlatform = (platform: Platform) => {
    setDraft((current) => {
      const exists = current.platforms.includes(platform);
      const platforms = exists
        ? current.platforms.filter((item) => item !== platform)
        : [...current.platforms, platform];

      return { ...current, platforms };
    });
  };

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const fileNames = files.map((file) => file.name);

    setSelectedFiles(files);
    setUploadError("");
    updateDraft("fileNames", fileNames);
  };

  const uploadSelectedFiles = async () => {
    if (!selectedFiles.length) {
      setUploadError("請先選擇要上傳的圖片或影片。");
      return;
    }

    const invalidFile = selectedFiles.find((file) => validateMediaFile(file));
    if (invalidFile) {
      setUploadError(`${invalidFile.name}：${validateMediaFile(invalidFile)}`);
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setNotice("");

    const results = await Promise.allSettled(
      selectedFiles.map((file) => uploadSocialMediaFile(token, file))
    );
    const uploadedFiles = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const failedFiles = selectedFiles.filter(
      (_, index) => results[index]?.status === "rejected"
    );
    const firstFailure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    if (uploadedFiles.length) {
      const nextMediaFiles = [...draft.mediaFiles, ...uploadedFiles];
      const nextFileNames = Array.from(
        new Set([...draft.fileNames, ...uploadedFiles.map((file) => file.fileName)])
      );
      const nextDraft = {
        ...draft,
        fileNames: nextFileNames,
        mediaFiles: nextMediaFiles,
      };

      setDraft(nextDraft);
      setPreview(nextDraft);
      setNotice(`已上傳 ${uploadedFiles.length} 個暫存檔，儲存任務後會一併保留網址。`);
    }

    setSelectedFiles(failedFiles);
    if (!failedFiles.length) {
      setFileInputKey((current) => current + 1);
    }
    setUploadError(
      firstFailure
        ? firstFailure.reason instanceof Error
          ? firstFailure.reason.message
          : "部分檔案上傳失敗，請稍後再試。"
        : ""
    );
    setIsUploading(false);
  };

  const saveDraft = (event: FormEvent) => {
    event.preventDefault();

    if (!draft.content.trim()) {
      setNotice("請先輸入發文內容。");
      return;
    }

    const existingDraft = editingDraftId
      ? savedDrafts.find((item) => item.id === editingDraftId)
      : undefined;
    const nextDraft = storedDraftFromForm(draft, existingDraft);
    const nextDrafts = existingDraft
      ? savedDrafts.map((item) => (item.id === existingDraft.id ? nextDraft : item))
      : [nextDraft, ...savedDrafts];

    persistDrafts(nextDrafts);
    if (existingDraft) {
      setEditingDraftId(nextDraft.id);
      setPreview(formFromStoredDraft(nextDraft));
    } else {
      setEditingDraftId(null);
      setDraft(defaultDraft);
      setPreview(defaultDraft);
      setSelectedFiles([]);
      setUploadError("");
      setFileInputKey((current) => current + 1);
    }
    setNotice(
      existingDraft
        ? "已更新此任務，目前尚未真的發文。"
        : "已新增發文任務，目前尚未真的發文。表單已清空，可繼續新增下一筆。"
    );
  };

  const updatePreview = () => {
    setPreview(draft);
    setNotice("預覽已更新。這只是測試預覽，尚未發文。");
  };

  const clearForm = () => {
    setDraft(defaultDraft);
    setPreview(defaultDraft);
    setEditingDraftId(null);
    setSelectedFiles([]);
    setUploadError("");
    setFileInputKey((current) => current + 1);
    setNotice("表單已清空，可以新增另一筆發文任務。");
  };

  const editSavedDraft = (item: StoredSocialDraft) => {
    const nextForm = formFromStoredDraft(item);
    setDraft(nextForm);
    setPreview(nextForm);
    setEditingDraftId(item.id);
    setSelectedFiles([]);
    setUploadError("");
    setFileInputKey((current) => current + 1);
    setNotice(`正在編輯「${item.title || "未命名草稿"}」。`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copySavedDraft = (item: StoredSocialDraft) => {
    const now = new Date().toISOString();
    const copiedDraft: StoredSocialDraft = {
      ...item,
      id: createDraftId(),
      title: item.title ? `${item.title} 副本` : "未命名草稿 副本",
      status: "pending",
      publishedAt: undefined,
      facebookPostId: undefined,
      facebookPermalinkUrl: undefined,
      deletedAt: undefined,
      deleteSource: undefined,
      lastSyncedAt: undefined,
      publishError: null,
      createdAt: now,
      updatedAt: now,
    };
    const nextDrafts = [copiedDraft, ...savedDrafts];

    persistDrafts(nextDrafts);
    setNotice("已複製成一筆新草稿。");
  };

  const publishSavedDraftToFacebook = async (item: StoredSocialDraft) => {
    const isEditingThisTask = editingDraftId === item.id;
    const latestItem = isEditingThisTask
      ? storedDraftFromForm(draft, item)
      : {
          ...item,
          content: item.content.trim(),
          hashtags: item.hashtags.trim(),
        };

    if (!latestItem.content) {
      setNotice("請先輸入發文內容。");
      return;
    }

    if (!latestItem.platforms.includes("Facebook")) {
      setNotice("此任務尚未勾選 Facebook，請先編輯任務。");
      return;
    }

    const facebookMessage = [
      latestItem.content,
      latestItem.hashtags,
    ].filter(Boolean).join("\n\n");

    const confirmed = window.confirm(
      `確定要發佈到 Facebook 粉絲專頁嗎？此動作會真的發文。\n\n發文內容：\n${facebookMessage}`
    );
    if (!confirmed) return;

    const draftsWithLatestContent = savedDrafts.map((draftItem) =>
      draftItem.id === item.id ? latestItem : draftItem
    );
    saveStoredDrafts(draftsWithLatestContent);
    setSavedDrafts(draftsWithLatestContent);

    setPublishingDraftId(item.id);
    setNotice("");

    try {
      await syncSocialPosts(token, draftsWithLatestContent);
      const result = await publishFacebookPost(
        token,
        latestItem.id,
        latestItem.content,
        latestItem.hashtags
      );
      const nextDrafts = draftsWithLatestContent.map((draftItem) =>
        draftItem.id === item.id
          ? {
              ...draftItem,
              status: "published" as const,
              publishedAt: result.createdAt,
              facebookPostId: result.facebookPostId,
              facebookPermalinkUrl:
                result.facebookPermalinkUrl || undefined,
              deletedAt: undefined,
              deleteSource: undefined,
              lastSyncedAt: undefined,
              publishError: null,
              updatedAt: result.createdAt,
            }
          : draftItem
      );

      persistDrafts(nextDrafts);
      setNotice(
        `已發佈到 Facebook，貼文編號：${result.facebookPostId}`
      );
    } catch (error) {
      const publishError = error as Error & {
        errorCode?: string;
        metaError?: FacebookPublishErrorDetails | null;
      };
      const updatedAt = new Date().toISOString();
      const nextDrafts = draftsWithLatestContent.map((draftItem) =>
        draftItem.id === item.id
          ? {
              ...draftItem,
              status: "failed" as const,
              publishError: {
                errorCode:
                  publishError.errorCode || "FACEBOOK_PUBLISH_FAILED",
                errorMessage:
                  publishError.message ||
                  "Facebook 發文失敗，請稍後再試。",
                metaError: publishError.metaError || null,
              },
              updatedAt,
            }
          : draftItem
      );

      persistDrafts(nextDrafts);
      setNotice(
        `Facebook 發文失敗：${publishError.message || "請稍後再試。"}`
      );
    } finally {
      setPublishingDraftId(null);
    }
  };

  const requestFacebookPostDelete = (item: StoredSocialDraft) => {
    if (item.status !== "published") {
      setNotice("只有已發布的 Facebook 貼文可以刪除。");
      return;
    }

    if (!item.facebookPostId) {
      setNotice("這筆任務沒有 Facebook 貼文 ID，無法刪除。");
      return;
    }

    setNotice("");
    setFacebookDeleteTarget(item);
  };

  const confirmFacebookPostDelete = async () => {
    const item = facebookDeleteTarget;
    if (!item?.facebookPostId) {
      setFacebookDeleteTarget(null);
      setNotice("這筆任務沒有 Facebook 貼文 ID，無法刪除。");
      return;
    }

    setDeletingFacebookDraftId(item.id);
    setNotice("");

    try {
      await syncSocialPosts(token, savedDrafts);
      const result = await deleteFacebookPost(
        token,
        item.id,
        item.facebookPostId
      );
      const nextDrafts = savedDrafts.map((draftItem) =>
        draftItem.id === item.id
          ? {
              ...draftItem,
              status: "deleted" as const,
              deletedAt: result.deletedAt,
              deleteSource: "admin" as const,
              lastSyncedAt: result.deletedAt,
              updatedAt: result.deletedAt,
            }
          : draftItem
      );

      persistDrafts(nextDrafts);
      setFacebookDeleteTarget(null);
      setNotice("Facebook 貼文已刪除，後台已保留刪除紀錄。");
    } catch (error) {
      const deleteError = error as Error & {
        errorCode?: string;
      };
      setNotice(
        deleteError.message || "Facebook 貼文刪除失敗，請稍後再試。"
      );
    } finally {
      setDeletingFacebookDraftId(null);
    }
  };

  const syncPublishedFacebookPost = async (item: StoredSocialDraft) => {
    if (item.status !== "published" || !item.facebookPostId) return;

    setSyncingFacebookDraftId(item.id);
    setNotice("");

    try {
      await syncSocialPosts(token, savedDrafts);
      const result = await syncFacebookPostStatus(token, item.id);
      const nextDrafts = savedDrafts.map((draftItem) =>
        draftItem.id === item.id
          ? {
              ...draftItem,
              status: result.status,
              facebookPermalinkUrl:
                result.facebookPermalinkUrl || undefined,
              lastSyncedAt: result.lastSyncedAt,
              deletedAt: result.deletedAt || undefined,
              deleteSource: result.deleteSource || undefined,
              updatedAt: result.lastSyncedAt,
            }
          : draftItem
      );

      persistDrafts(nextDrafts);
      setNotice(
        result.status === "deleted"
          ? "Facebook 上已找不到這篇貼文，後台已標記為已刪除。"
          : "Facebook 貼文狀態已同步，貼文仍正常存在。"
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Facebook 狀態同步失敗，請稍後再試。"
      );
    } finally {
      setSyncingFacebookDraftId(null);
    }
  };

  const deleteSavedDraft = (item: StoredSocialDraft) => {
    const confirmed = window.confirm(`確定要刪除「${item.title || "未命名草稿"}」嗎？`);
    if (!confirmed) return;

    const nextDrafts = savedDrafts.filter((draftItem) => draftItem.id !== item.id);
    persistDrafts(nextDrafts);

    if (editingDraftId === item.id) {
      setEditingDraftId(null);
      setDraft(defaultDraft);
      setPreview(defaultDraft);
    }

    setNotice("草稿已刪除。");
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const getTaskSummary = (item: StoredSocialDraft) =>
    item.title.trim() || item.content.trim() || "未命名發文任務";

  const getTaskPublishTime = (item: StoredSocialDraft) => {
    if (item.status === "scheduled" && item.scheduledAt) {
      return formatDateTime(item.scheduledAt);
    }
    if (item.publishedAt) return formatDateTime(item.publishedAt);
    return "尚未發布";
  };

  const renderTaskActionMenu = (item: StoredSocialDraft) => {
    const isOpen = openTaskMenuId === item.id;
    const closeMenu = () => setOpenTaskMenuId(null);
    const actionClasses =
      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-[#fbf7f1]";

    return (
      <div
        className="relative"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={`開啟 ${getTaskSummary(item)} 操作選單`}
          aria-expanded={isOpen}
          onClick={() =>
            setOpenTaskMenuId((current) =>
              current === item.id ? null : item.id
            )
          }
          className="flex size-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-[#cdbba8] hover:bg-[#fbf7f1]"
        >
          <MoreHorizontal className="size-4" />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-[8px] border border-stone-200 bg-white py-1 shadow-xl">
            {item.facebookPermalinkUrl ? (
              <a
                href={item.facebookPermalinkUrl}
                target="_blank"
                rel="noreferrer"
                onClick={closeMenu}
                className={actionClasses}
              >
                <ExternalLink className="size-4" />
                查看 FB 文章
              </a>
            ) : (
              <span className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-300">
                <ExternalLink className="size-4" />
                查看 FB 文章
              </span>
            )}

            {item.status === "published" && item.facebookPostId && (
              <button
                type="button"
                disabled={syncingFacebookDraftId === item.id}
                onClick={() => {
                  closeMenu();
                  void syncPublishedFacebookPost(item);
                }}
                className={actionClasses}
              >
                {syncingFacebookDraftId === item.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                同步狀態
              </button>
            )}

            {item.status !== "published" &&
              item.status !== "deleted" &&
              item.platforms.includes("Facebook") && (
                <button
                  type="button"
                  disabled={publishingDraftId === item.id}
                  onClick={() => {
                    closeMenu();
                    void publishSavedDraftToFacebook(item);
                  }}
                  className={actionClasses}
                >
                  {publishingDraftId === item.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  發佈到 Facebook
                </button>
              )}

            <button
              type="button"
              onClick={() => {
                closeMenu();
                copySavedDraft(item);
              }}
              className={actionClasses}
            >
              <Copy className="size-4" />
              複製
            </button>
            <button
              type="button"
              onClick={() => {
                closeMenu();
                editSavedDraft(item);
              }}
              className={actionClasses}
            >
              <Edit3 className="size-4" />
              編輯
            </button>

            {item.status === "published" && item.facebookPostId && (
              <button
                type="button"
                disabled={deletingFacebookDraftId === item.id}
                onClick={() => {
                  closeMenu();
                  requestFacebookPostDelete(item);
                }}
                className={`${actionClasses} text-red-700`}
              >
                <Trash2 className="size-4" />
                刪除 FB 貼文
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                closeMenu();
                deleteSavedDraft(item);
              }}
              className={`${actionClasses} border-t border-stone-100 text-red-700`}
            >
              <Trash2 className="size-4" />
              刪除任務紀錄
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderTaskDetails = (item: StoredSocialDraft) => (
    <div className="grid gap-3 bg-[#fffaf7] p-4 text-sm text-stone-600 lg:grid-cols-2">
      <div>
        <p className="text-xs font-semibold text-stone-400">發文內容</p>
        <p className="mt-1 whitespace-pre-wrap leading-6">
          {item.content || "尚未填寫內容"}
        </p>
        {item.hashtags && (
          <p className="mt-2 text-[#8b6f5b]">{item.hashtags}</p>
        )}
      </div>
      <dl className="grid gap-1.5">
        {item.publishedAt && (
          <div>
            <dt className="inline text-stone-400">原發文時間：</dt>
            <dd className="inline">{formatDateTime(item.publishedAt)}</dd>
          </div>
        )}
        {item.deletedAt && (
          <div>
            <dt className="inline text-stone-400">刪除時間：</dt>
            <dd className="inline">{formatDateTime(item.deletedAt)}</dd>
          </div>
        )}
        {item.deleteSource && (
          <div>
            <dt className="inline text-stone-400">刪除來源：</dt>
            <dd className="inline">
              {item.deleteSource === "facebook"
                ? "Facebook"
                : item.deleteSource === "admin"
                  ? "後台管理員"
                  : "API"}
            </dd>
          </div>
        )}
        {item.facebookPostId && (
          <div>
            <dt className="inline text-stone-400">Facebook 貼文編號：</dt>
            <dd className="inline break-all">{item.facebookPostId}</dd>
          </div>
        )}
        {item.facebookPermalinkUrl && (
          <div>
            <dt className="inline text-stone-400">文章連結：</dt>
            <dd className="inline">
              <a
                href={item.facebookPermalinkUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[#8b6f5b] underline underline-offset-2"
              >
                {item.facebookPermalinkUrl}
              </a>
            </dd>
          </div>
        )}
        {item.publishError && (
          <div className="mt-1 rounded-[6px] bg-orange-50 px-3 py-2 text-orange-700">
            發布失敗：{item.publishError.errorMessage}
          </div>
        )}
      </dl>
    </div>
  );

  if (!token) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f2ea] px-5 text-stone-900">
        <section className="w-full max-w-md rounded-[8px] border border-stone-200 bg-white p-7 text-center shadow-xl shadow-stone-200/70">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#8b6f5b] text-white">
            <LockKeyhole className="size-5" />
          </div>
          <p className="mt-5 text-xs uppercase tracking-[0.24em] text-stone-400">
            MUMBAO Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold">自動發文</h1>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            請先登入商城後台，再回到自動發文頁建立社群貼文草稿。
          </p>
          <Link
            href="/admin/shop"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#8b6f5b] px-5 text-sm font-semibold text-white transition hover:bg-[#765d4a]"
          >
            前往商城後台登入
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-7 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Social Draft Studio
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              自動發文
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
              建立 IG、FB、Threads 發文草稿，圖片與影片未來會暫存至 Cloudflare R2，7 天後自動刪除。
            </p>
          </div>
          <div className="rounded-[8px] border border-[#eadfce] bg-[#fffaf3] px-4 py-3 text-sm leading-6 text-stone-600">
            <p className="font-semibold text-stone-800">目前發文狀態</p>
            <p>Facebook 純文字發文已啟用；Instagram 與 Threads 尚未啟用。</p>
          </div>
        </div>
      </header>

      <AdminShopNav current="social" />

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8 md:py-8">
        <section className="rounded-[8px] border border-stone-200 bg-white px-4 py-3 shadow-sm md:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              {(
                [
                  ["facebook", "Facebook", "Facebook"],
                  ["instagram", "Instagram", "IG"],
                  ["threads", "Threads", "Threads"],
                ] as const
              ).map(([key, desktopLabel, mobileLabel]) => {
                const connection = metaConnections[key];

                return (
                  <div
                    key={key}
                    className="flex min-w-0 items-center gap-2 text-sm"
                  >
                    <span className="font-semibold text-stone-800">
                      <span className="sm:hidden">{mobileLabel}</span>
                      <span className="hidden sm:inline">{desktopLabel}</span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                        getMetaStatusClasses(connection.status)
                      )}
                    >
                      {connection.status === "checking" && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                      {connection.status === "connected" && (
                        <CheckCircle2 className="size-3" />
                      )}
                      {connection.status === "error" && (
                        <AlertCircle className="size-3" />
                      )}
                      {getMetaStatusLabel(connection.status)}
                    </span>
                  </div>
                );
              })}

              <span className="hidden text-stone-300 sm:inline">｜</span>
              <p className="text-xs text-stone-500 sm:text-sm">
                最後檢查：
                {metaCheckedAt
                  ? formatDateTime(metaCheckedAt)
                  : "尚未完成檢查"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={refreshMetaConnections}
                disabled={isCheckingMeta || isCheckingFacebookToken}
                className="h-10 rounded-full bg-white px-4 text-sm"
              >
                {isCheckingMeta || isCheckingFacebookToken ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {isCheckingMeta || isCheckingFacebookToken
                  ? "檢查中..."
                  : "重新檢查"}
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-expanded={isMetaDetailsExpanded}
                onClick={() =>
                  setIsMetaDetailsExpanded((isExpanded) => !isExpanded)
                }
                className="h-10 rounded-full bg-[#fffaf7] px-4 text-sm"
              >
                {isMetaDetailsExpanded ? "收合設定" : "詳細設定"}
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    isMetaDetailsExpanded && "rotate-180"
                  )}
                />
              </Button>
            </div>
          </div>
        </section>

        {isMetaDetailsExpanded && (
          <div className="space-y-6">
        <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Meta Connection
              </p>
              <h2 className="mt-1 font-serif text-2xl font-light">
                平台連線狀態
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                這裡只檢查帳號與權杖是否可讀取，不會建立或發布任何貼文。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={refreshMetaConnections}
              disabled={isCheckingMeta || isCheckingFacebookToken}
              className="h-11 rounded-full bg-white px-5"
            >
              {isCheckingMeta || isCheckingFacebookToken ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {isCheckingMeta || isCheckingFacebookToken
                ? "檢查中..."
                : "重新檢查連線"}
            </Button>
          </div>

          {metaCheckError && (
            <div className="mt-4 flex items-start gap-2 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{metaCheckError}</span>
            </div>
          )}

          <div className="mt-5 grid gap-3">
            {(
              [
                ["facebook", "Facebook"],
                ["instagram", "Instagram"],
                ["threads", "Threads"],
              ] as const
            ).map(([key, label]) => {
              const connection = metaConnections[key];
              const facebookTokenHealth =
                key === "facebook" && facebookTokenDebug
                  ? getFacebookTokenHealth(facebookTokenDebug)
                  : null;
              const isExpanded = expandedMetaPlatform === key;

              return (
                <article
                  key={key}
                  className={cn(
                    "rounded-[8px] border border-stone-200 bg-[#fffaf7] transition-colors",
                    isExpanded ? "p-4 md:p-5" : "p-3.5 md:p-4"
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-stone-900">{label}</h3>
                      {key === "facebook" && connection.accountName && (
                        <p className="mt-1 truncate text-sm text-stone-600">
                          {connection.accountName}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                          getMetaStatusClasses(connection.status)
                        )}
                      >
                        {connection.status === "checking" && (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        {connection.status === "connected" && (
                          <CheckCircle2 className="size-3" />
                        )}
                        {connection.status === "error" && (
                          <AlertCircle className="size-3" />
                        )}
                        {getMetaStatusLabel(connection.status)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedMetaPlatform((current) =>
                            current === key ? null : key
                          )
                        }
                        className="h-9 shrink-0 rounded-full bg-white px-3 text-xs"
                      >
                        {isExpanded ? "收合" : "展開"}
                        <ChevronDown
                          className={cn(
                            "size-3.5 transition-transform",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 border-t border-stone-200 pt-4 text-sm leading-6">
                      {connection.accountName ? (
                        <p className="font-medium text-stone-800">
                          {connection.accountName}
                        </p>
                      ) : connection.status === "not_configured" ? (
                        <p className="text-stone-500">
                          尚未設定此平台所需的環境變數。
                        </p>
                      ) : connection.status === "checking" ? (
                        <p className="text-stone-500">
                          正在向 Meta 確認帳號資料。
                        </p>
                      ) : null}

                    {connection.error && (
                      <div className="text-red-600">
                        {connection.errorCode && (
                          <p className="font-mono text-xs font-semibold">
                            {connection.errorCode}
                          </p>
                        )}
                        <p>{connection.error}</p>
                        {connection.metaError && (
                          <dl className="mt-2 grid gap-1 rounded-[6px] bg-red-100/60 p-2 font-mono text-[11px] leading-5">
                            <div>
                              <dt className="inline font-semibold">code：</dt>
                              <dd className="inline">
                                {connection.metaError.code ?? "無"}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline font-semibold">type：</dt>
                              <dd className="inline">
                                {connection.metaError.type || "無"}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline font-semibold">subcode：</dt>
                              <dd className="inline">
                                {connection.metaError.error_subcode ?? "無"}
                              </dd>
                            </div>
                          </dl>
                        )}
                      </div>
                    )}

                    {key === "facebook" && connection.diagnostics && (
                      <div className="mt-3 border-t border-stone-200 pt-3 text-xs leading-5 text-stone-500">
                        <p className="font-semibold text-stone-700">
                          環境變數檢查
                        </p>
                        <p>
                          Page ID：
                          {connection.diagnostics.hasFacebookPageId
                            ? `已設定（${connection.diagnostics.facebookPageIdLength} 字元）`
                            : "未設定或空白"}
                        </p>
                        <p>
                          Page Token：
                          {connection.diagnostics.hasFacebookPageToken
                            ? `已設定（${connection.diagnostics.facebookPageTokenLength} 字元，開頭 ${connection.diagnostics.facebookPageTokenPrefix}）`
                            : "未設定或空白"}
                        </p>
                      </div>
                    )}

                    {key === "facebook" && (
                      <div className="mt-4 border-t border-stone-200 pt-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-stone-800">
                            Token 健康檢查
                          </p>
                          {isCheckingFacebookToken && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <Loader2 className="size-3 animate-spin" />
                              檢查中
                            </span>
                          )}
                        </div>

                        {facebookTokenDebugError && (
                          <div className="mt-3 rounded-[6px] border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">
                            <p className="font-mono font-semibold">
                              {facebookTokenDebugError.code}
                            </p>
                            <p>{facebookTokenDebugError.message}</p>
                            {facebookTokenDebugError.metaError && (
                              <p className="mt-1 font-mono">
                                Meta code{" "}
                                {facebookTokenDebugError.metaError.code ??
                                  "無"}{" "}
                                /{" "}
                                {facebookTokenDebugError.metaError.type ||
                                  "未知類型"}{" "}
                                / subcode{" "}
                                {facebookTokenDebugError.metaError
                                  .error_subcode ?? "無"}
                              </p>
                            )}
                          </div>
                        )}

                        {facebookTokenDebug && (
                          <div className="mt-3 space-y-3 text-xs leading-5 text-stone-600">
                            <dl className="grid gap-2">
                              <div className="flex justify-between gap-3">
                                <dt>Token 狀態</dt>
                                <dd
                                  className={cn(
                                    "font-semibold",
                                    facebookTokenDebug.isValid
                                      ? "text-emerald-700"
                                      : "text-red-700"
                                  )}
                                >
                                  {facebookTokenDebug.isValid
                                    ? "有效"
                                    : "無效"}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3">
                                <dt>Token 類型</dt>
                                <dd className="break-all text-right font-medium text-stone-800">
                                  {facebookTokenDebug.type || "Meta 未提供"}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3">
                                <dt>應用程式</dt>
                                <dd className="break-all text-right">
                                  {facebookTokenDebug.application ||
                                    facebookTokenDebug.appId ||
                                    "Meta 未提供"}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3">
                                <dt>Token</dt>
                                <dd className="font-mono">
                                  {facebookTokenDebug.tokenPrefix}
                                  {"•".repeat(6)}（
                                  {facebookTokenDebug.tokenLength} 字元）
                                </dd>
                              </div>
                              <div className="grid gap-1">
                                <dt>到期時間</dt>
                                <dd className="font-medium text-stone-800">
                                  {facebookTokenDebug.expiresAt
                                    ? formatUnixTime(
                                        facebookTokenDebug.expiresAt
                                      )
                                    : "未提供固定到期時間 / 可能為長效 Page Token"}
                                </dd>
                                {facebookTokenDebug.expiresAt && (
                                  <dd
                                    className={cn(
                                      "font-semibold",
                                      (getRemainingDays(
                                        facebookTokenDebug.expiresAt
                                      ) ?? 0) <= 0
                                        ? "text-red-700"
                                        : (getRemainingDays(
                                              facebookTokenDebug.expiresAt
                                            ) ?? 8) <= 7
                                          ? "text-amber-700"
                                          : "text-stone-500"
                                    )}
                                  >
                                    {getExpiryDayLabel(
                                      facebookTokenDebug.expiresAt,
                                      "Token "
                                    )}
                                  </dd>
                                )}
                              </div>
                              {facebookTokenDebug.dataAccessExpiresAt && (
                                <div className="grid gap-1">
                                  <dt>資料存取到期時間</dt>
                                  <dd className="font-medium text-stone-800">
                                    {formatUnixTime(
                                      facebookTokenDebug.dataAccessExpiresAt
                                    )}
                                  </dd>
                                  <dd
                                    className={cn(
                                      "font-semibold",
                                      (getRemainingDays(
                                        facebookTokenDebug.dataAccessExpiresAt
                                      ) ?? 0) <= 0
                                        ? "text-red-700"
                                        : (getRemainingDays(
                                              facebookTokenDebug.dataAccessExpiresAt
                                            ) ?? 8) <= 7
                                          ? "text-amber-700"
                                          : "text-stone-500"
                                    )}
                                  >
                                    {getExpiryDayLabel(
                                      facebookTokenDebug.dataAccessExpiresAt,
                                      "資料存取權限 "
                                    )}
                                  </dd>
                                </div>
                              )}
                            </dl>

                            <div>
                              <p className="font-semibold text-stone-700">
                                權限 scopes
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {facebookTokenDebug.scopes.length ? (
                                  facebookTokenDebug.scopes.map((scope) => (
                                    <span
                                      key={scope}
                                      className="rounded-full border border-stone-200 bg-white px-2 py-0.5 font-mono text-[10px] text-stone-600"
                                    >
                                      {scope}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-stone-500">
                                    Meta 未回傳 scopes
                                  </span>
                                )}
                              </div>
                            </div>

                            {facebookTokenHealth && (
                              <div
                                className={cn(
                                  "rounded-[6px] border p-3 font-medium",
                                  facebookTokenHealth.level === "error"
                                    ? "border-red-200 bg-red-50 text-red-800"
                                    : facebookTokenHealth.level === "warning"
                                      ? "border-amber-200 bg-amber-50 text-amber-900"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                                )}
                              >
                                {facebookTokenHealth.message}
                              </div>
                            )}

                            {facebookTokenDebug.errorMessage && (
                              <p className="text-red-700">
                                {facebookTokenDebug.errorCode}：
                                {facebookTokenDebug.errorMessage}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-stone-400">
            最後檢查時間：
            {metaCheckedAt ? formatDateTime(metaCheckedAt) : "尚未完成檢查"}
          </p>
        </section>

        <section className="rounded-[8px] border border-stone-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#fbf0e4] text-[#8b6f5b]">
                <KeyRound className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-xl font-light text-stone-900 md:text-2xl">
                  進階工具：Facebook Token 更新
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  只有管理者需要更新 Facebook Token
                  時才使用，管家日常發文不需要操作。
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-expanded={isMetaTokenHelperExpanded}
              onClick={() =>
                setIsMetaTokenHelperExpanded((isExpanded) => !isExpanded)
              }
              className="h-10 w-full shrink-0 rounded-full bg-white px-4 text-sm sm:w-auto"
            >
              {isMetaTokenHelperExpanded ? "收合" : "展開"}
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  isMetaTokenHelperExpanded && "rotate-180"
                )}
              />
            </Button>
          </div>

          {isMetaTokenHelperExpanded && (
            <div className="mt-5 border-t border-stone-200 pt-5">
              <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                此工具只給管理者更新 Facebook Token
                使用。若只是建立發文草稿、發布文章或查看任務紀錄，不需要操作這裡。
              </div>

              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                  Meta Token Helper
                </p>
                <h3 className="mt-1 font-serif text-2xl font-light">
                  Facebook 長效 Page Token 輔助工具
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
                  將 Graph API Explorer 產生的短效 User Token
                  交換為長效 User Token，再取得目前 FACEBOOK_PAGE_ID
                  對應的 Page Access Token。輸入內容不會保存。
                </p>
              </div>

          <form
            onSubmit={handleMetaTokenExchange}
            className="mt-5 rounded-[8px] border border-[#eadfce] bg-[#fffaf5] p-4 md:p-5"
          >
            <label
              htmlFor="short-lived-user-token"
              className="text-sm font-semibold text-stone-800"
            >
              短效 User Token
            </label>
            <div className="mt-2 flex flex-col gap-3 md:flex-row">
              <input
                id="short-lived-user-token"
                type="password"
                value={shortLivedUserToken}
                onChange={(event) =>
                  setShortLivedUserToken(event.target.value)
                }
                autoComplete="off"
                spellCheck={false}
                placeholder="貼上 Graph API Explorer 產生的短效 User Token"
                className="h-11 min-w-0 flex-1 rounded-[8px] border border-stone-200 bg-white px-4 text-base outline-none transition focus:border-[#8b6f5b]"
              />
              <Button
                type="submit"
                disabled={
                  isExchangingMetaToken || !shortLivedUserToken.trim()
                }
                className="h-11 rounded-full bg-[#8b6f5b] px-6 text-white hover:bg-[#765d4a]"
              >
                {isExchangingMetaToken ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {isExchangingMetaToken ? "交換中..." : "交換長效 Token"}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              送出後輸入框會立即清空。Token
              不會寫入 localStorage、資料庫或網站紀錄。
            </p>
          </form>

          {metaTokenError && (
            <div className="mt-4 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              <p className="font-mono text-xs font-semibold">
                {metaTokenError.code}
              </p>
              <p>{metaTokenError.message}</p>
              {metaTokenError.metaError && (
                <p className="mt-1 font-mono text-xs">
                  Meta code {metaTokenError.metaError.code ?? "無"} /{" "}
                  {metaTokenError.metaError.type || "未知類型"} / subcode{" "}
                  {metaTokenError.metaError.error_subcode ?? "無"}
                </p>
              )}
            </div>
          )}

          {metaTokenResult && (
            <div className="mt-5 space-y-4 rounded-[8px] border border-emerald-200 bg-emerald-50 p-4 md:p-5">
              <div className="flex items-start gap-2 text-emerald-800">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">已取得 Page Access Token</p>
                  <p className="mt-1 text-sm">
                    {metaTokenResult.pageName}（{metaTokenResult.pageId}）
                  </p>
                </div>
              </div>

              <dl className="grid gap-3 text-sm text-stone-700 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-stone-500">Token 狀態</dt>
                  <dd className="mt-1 font-medium">
                    {metaTokenResult.hasPageAccessToken ? "已取得" : "未取得"}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Token 開頭</dt>
                  <dd className="mt-1 font-mono font-medium">
                    {metaTokenResult.pageAccessTokenPrefix}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Token 長度</dt>
                  <dd className="mt-1 font-medium">
                    {metaTokenResult.pageAccessTokenLength} 字元
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">User Token 有效秒數</dt>
                  <dd className="mt-1 font-medium">
                    {metaTokenResult.expiresIn ?? "Meta 未回傳"}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-sm text-stone-500">粉絲專頁 tasks</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {metaTokenResult.tasks.length ? (
                    metaTokenResult.tasks.map((task) => (
                      <span
                        key={task}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-600"
                      >
                        {task}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-stone-500">
                      Meta 未回傳 tasks
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[8px] border border-emerald-200 bg-white p-4">
                <p className="text-sm font-semibold text-stone-800">
                  Page Access Token
                </p>
                <div className="mt-2 rounded-[8px] bg-stone-100 p-3 font-mono text-xs leading-6 text-stone-700">
                  {isPageTokenVisible
                    ? metaTokenResult.pageAccessToken
                    : `${metaTokenResult.pageAccessTokenPrefix}${"•".repeat(
                        18
                      )}`}
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={revealPageAccessTokenOnce}
                    disabled={isPageTokenVisible}
                    className="h-10 rounded-full bg-white px-4"
                  >
                    {isPageTokenVisible ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {isPageTokenVisible ? "已顯示完整 Token" : "顯示一次"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void copyPageAccessToken()}
                    className="h-10 rounded-full bg-[#8b6f5b] px-4 text-white hover:bg-[#765d4a]"
                  >
                    <Clipboard className="size-4" />
                    {pageTokenCopied
                      ? "已複製 Page Access Token"
                      : "複製 Page Access Token"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearMetaTokenResult}
                    className="h-10 rounded-full bg-white px-4 sm:ml-auto"
                  >
                    清除結果
                  </Button>
                </div>
              </div>

              <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                請將 Page Access Token 手動貼到 Vercel 專案的{" "}
                <code className="font-mono font-semibold">
                  FACEBOOK_PAGE_ACCESS_TOKEN
                </code>
                ，儲存後重新部署。Vercel Environment Variables
                無法由本工具直接修改。
              </div>
            </div>
          )}
            </div>
          )}
        </section>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <form
            onSubmit={saveDraft}
            className="space-y-5 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm md:p-6"
          >
            <section className="space-y-4">
              <div className="grid gap-2">
                <label htmlFor="social-title">
                  <FieldLabel>發文標題，內部辨識用</FieldLabel>
                </label>
                <input
                  id="social-title"
                  value={draft.title}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder="例如：七月試營運公告"
                  className="h-11 w-full rounded-[8px] border border-stone-200 bg-[#fffaf7] px-4 text-base outline-none transition focus:border-[#8b6f5b] focus:bg-white"
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="social-content">
                  <FieldLabel>發文內容</FieldLabel>
                </label>
                <textarea
                  id="social-content"
                  value={draft.content}
                  onChange={(event) => updateDraft("content", event.target.value)}
                  placeholder="輸入準備發布到 IG、FB、Threads 的文字內容。"
                  rows={8}
                  className="w-full resize-y rounded-[8px] border border-stone-200 bg-[#fffaf7] px-4 py-3 text-base leading-7 outline-none transition focus:border-[#8b6f5b] focus:bg-white"
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="social-hashtags">
                  <FieldLabel>Hashtag</FieldLabel>
                </label>
                <input
                  id="social-hashtags"
                  value={draft.hashtags}
                  onChange={(event) => updateDraft("hashtags", event.target.value)}
                  placeholder="#慢慢蒔光 #STimeVilla #宜蘭包棟民宿"
                  className="h-11 w-full rounded-[8px] border border-stone-200 bg-[#fffaf7] px-4 text-base outline-none transition focus:border-[#8b6f5b] focus:bg-white"
                />
              </div>
            </section>

            <section className="grid gap-5 rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-4">
              <div className="grid gap-3">
                <FieldLabel>平台勾選</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-3">
                  {platformOptions.map((platform) => (
                    <label
                      key={platform}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] border px-4 py-3 text-sm font-medium transition",
                        draft.platforms.includes(platform)
                          ? "border-[#8b6f5b] bg-white text-stone-900 shadow-sm"
                          : "border-stone-200 bg-white/70 text-stone-500 hover:bg-white"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={draft.platforms.includes(platform)}
                        onChange={() => togglePlatform(platform)}
                        className="size-4 accent-[#8b6f5b]"
                      />
                      {platform}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <FieldLabel>發文模式</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: "now" as const, label: "立即發文" },
                    { value: "scheduled" as const, label: "排程發文" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] border px-4 py-3 text-sm font-medium transition",
                        draft.publishMode === option.value
                          ? "border-[#8b6f5b] bg-white text-stone-900 shadow-sm"
                          : "border-stone-200 bg-white/70 text-stone-500 hover:bg-white"
                      )}
                    >
                      <input
                        type="radio"
                        name="publishMode"
                        checked={draft.publishMode === option.value}
                        onChange={() => updateDraft("publishMode", option.value)}
                        className="size-4 accent-[#8b6f5b]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              {draft.publishMode === "scheduled" && (
                <div className="grid gap-2">
                  <label htmlFor="social-scheduled-at">
                    <FieldLabel>排程時間</FieldLabel>
                  </label>
                  <input
                    id="social-scheduled-at"
                    type="datetime-local"
                    value={draft.scheduledAt}
                    onChange={(event) => updateDraft("scheduledAt", event.target.value)}
                    className="h-11 w-full rounded-[8px] border border-stone-200 bg-white px-4 text-base outline-none transition focus:border-[#8b6f5b]"
                  />
                  <p className="text-xs text-stone-500">第一版只顯示排程 UI，不會真正排程。</p>
                </div>
              )}
            </section>

            <section className="rounded-[8px] border border-dashed border-[#d7c4ae] bg-[#fffaf3] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#8b6f5b]">
                    <FileImage className="size-5" />
                  </div>
                  <div>
                    <FieldLabel>圖片 / 影片選擇</FieldLabel>
                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      支援 JPG、PNG、WebP 與 MP4。圖片最大 10MB，影片最大 100MB。
                    </p>
                  </div>
                </div>
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#8b6f5b] shadow-sm ring-1 ring-stone-200 transition hover:bg-[#f4ece2]">
                  選擇檔案
                  <input
                    key={fileInputKey}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4"
                    onChange={handleFilesChange}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="mt-4 space-y-3">
                {selectedFiles.length > 0 ? (
                  selectedFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="flex flex-col gap-1 rounded-[8px] bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="break-all font-medium text-stone-700">{file.name}</span>
                      <span className="shrink-0 text-xs text-stone-500">
                        {file.type || "未知類型"}・{formatFileSize(file.size)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-400">尚未選擇新的圖片或影片。</p>
                )}
              </div>

              <Button
                type="button"
                onClick={uploadSelectedFiles}
                disabled={!selectedFiles.length || isUploading}
                className="mt-4 h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a] sm:w-auto"
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UploadCloud className="size-4" />
                )}
                {isUploading ? "上傳中..." : "上傳暫存檔"}
              </Button>

              {uploadError && (
                <p className="mt-3 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {uploadError}
                </p>
              )}

              {draft.mediaFiles.length > 0 && (
                <div className="mt-5 space-y-3 border-t border-[#eadfce] pt-4">
                  <p className="text-sm font-semibold text-stone-800">
                    已上傳暫存媒體（{draft.mediaFiles.length}）
                  </p>
                  {draft.mediaFiles.map((media) => (
                    <div
                      key={media.key}
                      className="rounded-[8px] border border-stone-100 bg-white p-3 text-sm"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <p className="break-all font-medium text-stone-800">{media.fileName}</p>
                        <p className="shrink-0 text-xs text-stone-500">
                          {media.contentType}・{formatFileSize(media.size)}
                        </p>
                      </div>
                      <a
                        href={media.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-all text-xs text-[#8b6f5b] underline underline-offset-2"
                      >
                        {media.publicUrl}
                      </a>
                    </div>
                  ))}
                  <p className="text-xs leading-5 text-stone-500">
                    此檔案位於 R2 social-temp/，約 7 天後會依 lifecycle 設定自動刪除。
                  </p>
                </div>
              )}
            </section>

            {notice && (
              <div className="flex items-center gap-2 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="size-4 shrink-0" />
                {notice}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center">
              <Button
                type="submit"
                className="h-11 rounded-full bg-[#8b6f5b] px-6 text-white hover:bg-[#765d4a]"
              >
                {editingDraftId ? "更新此任務" : "新增發文任務"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={updatePreview}
                className="h-11 rounded-full bg-white px-6"
              >
                測試預覽
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearForm}
                className="h-11 rounded-full bg-white px-6"
              >
                清空表單
              </Button>
              <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
                <Button type="button" disabled className="h-11 rounded-full px-6">
                  <Send className="size-4" />
                  請先儲存任務
                </Button>
                <p className="text-xs text-stone-400">
                  儲存後可從下方任務清單發佈到 Facebook
                </p>
              </div>
            </div>
          </form>

          <aside className="h-fit rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Preview
                </p>
                <h2 className="mt-1 font-serif text-2xl font-light">發文預覽</h2>
              </div>
              <div className="flex size-10 items-center justify-center rounded-full bg-[#fbf0e4] text-[#8b6f5b]">
                <Sparkles className="size-5" />
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-stone-400">
                  發文標題
                </p>
                <p className="mt-2 text-lg font-semibold text-stone-900">
                  {preview.title || <EmptyPreviewLine>尚未填寫標題</EmptyPreviewLine>}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-stone-400">
                  發文內容
                </p>
                <p className="mt-2 whitespace-pre-wrap rounded-[8px] bg-[#fbf7f1] p-4 text-sm leading-7 text-stone-700">
                  {preview.content || <EmptyPreviewLine>尚未填寫發文內容</EmptyPreviewLine>}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-stone-400">
                  Hashtag
                </p>
                <p className="mt-2 text-sm leading-6 text-[#8b6f5b]">
                  {preview.hashtags || <EmptyPreviewLine>尚未填寫 hashtag</EmptyPreviewLine>}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-[8px] border border-stone-100 bg-[#fffaf7] p-4">
                  <p className="text-xs font-semibold tracking-[0.18em] text-stone-400">
                    已選平台
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {preview.platforms.length > 0 ? (
                      preview.platforms.map((platform) => (
                        <span
                          key={platform}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600"
                        >
                          {platform}
                        </span>
                      ))
                    ) : (
                      <EmptyPreviewLine>尚未選擇平台</EmptyPreviewLine>
                    )}
                  </div>
                </div>

                <div className="rounded-[8px] border border-stone-100 bg-[#fffaf7] p-4">
                  <p className="text-xs font-semibold tracking-[0.18em] text-stone-400">
                    發文模式
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-stone-700">
                    <CalendarClock className="size-4 text-[#8b6f5b]" />
                    {preview.publishMode === "scheduled" ? "排程發文" : "立即發文"}
                  </div>
                  {preview.publishMode === "scheduled" && (
                    <p className="mt-2 text-sm text-stone-500">
                      {preview.scheduledAt || "尚未設定排程時間"}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-stone-400">
                  已上傳媒體（{preview.mediaFiles.length}）
                </p>
                <div className="mt-3 grid gap-3">
                  {preview.mediaFiles.length > 0 ? (
                    preview.mediaFiles.map((media) => (
                      <div
                        key={media.key}
                        className="overflow-hidden rounded-[8px] border border-stone-100 bg-[#fbf7f1]"
                      >
                        {media.contentType.startsWith("image/") ? (
                          <img
                            src={media.publicUrl}
                            alt={media.fileName}
                            className="max-h-64 w-full bg-white object-contain"
                          />
                        ) : media.contentType === "video/mp4" ? (
                          <video
                            src={media.publicUrl}
                            controls
                            preload="metadata"
                            className="max-h-64 w-full bg-black object-contain"
                          >
                            {media.fileName}
                          </video>
                        ) : null}
                        <div className="p-3">
                          <p className="break-all text-xs font-medium text-stone-700">
                            {media.fileName}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            {media.contentType}・{formatFileSize(media.size)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyPreviewLine>尚未上傳媒體</EmptyPreviewLine>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-2 border-b border-stone-100 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Social Tasks
              </p>
              <h2 className="mt-1 font-serif text-2xl font-light">發文任務與紀錄</h2>
            </div>
            <p className="text-sm text-stone-500">
              共 {savedDrafts.length} 筆，僅儲存在此瀏覽器的 localStorage。
            </p>
          </div>
          <p className="mt-4 rounded-[8px] bg-[#fbf7f1] px-4 py-3 text-sm leading-6 text-stone-600">
            Facebook 已支援純文字發文；Instagram、Threads、圖片與影片發文目前尚未啟用。
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["all", "全部"],
                ["draft", "草稿"],
                ["published", "已發布"],
                ["deleted", "已刪除"],
                ["failed", "發布失敗"],
                ["facebook", "Facebook"],
                ["instagram", "Instagram"],
                ["threads", "Threads"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTaskFilter(value)}
                className={cn(
                  "h-9 rounded-full border px-4 text-sm font-medium transition",
                  taskFilter === value
                    ? "border-[#8b6f5b] bg-[#8b6f5b] text-white"
                    : "border-stone-200 bg-white text-stone-600 hover:border-[#cdbba8] hover:bg-[#fffaf7]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 hidden xl:block">
            <div className="overflow-visible rounded-[8px] border border-stone-200">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-11" />
                  <col />
                  <col className="w-32" />
                  <col className="w-24" />
                  <col className="w-40" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-36" />
                  <col className="w-14" />
                </colgroup>
                <thead className="bg-[#f7f1e8] text-xs font-semibold text-stone-600">
                  <tr>
                    <th className="px-3 py-3">
                      <span className="sr-only">選取</span>
                    </th>
                    <th className="px-3 py-3">標題或內容摘要</th>
                    <th className="px-3 py-3">平台</th>
                    <th className="px-3 py-3">發文模式</th>
                    <th className="px-3 py-3">發布／排程時間</th>
                    <th className="px-3 py-3">媒體</th>
                    <th className="px-3 py-3">狀態</th>
                    <th className="px-3 py-3">最後同步</th>
                    <th className="px-3 py-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {visibleDrafts.map((item) => {
                    const isExpanded = expandedTaskId === item.id;
                    const isSelected = selectedTaskIds.has(item.id);

                    return (
                      <Fragment key={item.id}>
                        <tr
                          onClick={() =>
                            setExpandedTaskId((current) =>
                              current === item.id ? null : item.id
                            )
                          }
                          className={cn(
                            "h-[64px] cursor-pointer bg-white transition hover:bg-[#fffaf7]",
                            editingDraftId === item.id && "bg-[#fbf0e4]/60",
                            isExpanded && "bg-[#fffaf7]"
                          )}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleTaskSelection(item.id)}
                              aria-label={`選取 ${getTaskSummary(item)}`}
                              className="size-4 accent-[#8b6f5b]"
                            />
                          </td>
                          <td className="min-w-0 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <ChevronRight
                                className={cn(
                                  "size-4 shrink-0 text-stone-400 transition-transform",
                                  isExpanded && "rotate-90"
                                )}
                              />
                              <p
                                className="truncate font-medium text-stone-900"
                                title={getTaskSummary(item)}
                              >
                                {getTaskSummary(item)}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-stone-600">
                            <p className="truncate">
                              {item.platforms.join(" / ") || "未選擇"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-xs text-stone-600">
                            {getModeLabel(item.mode)}
                          </td>
                          <td className="px-3 py-2 text-xs text-stone-600">
                            {getTaskPublishTime(item)}
                          </td>
                          <td className="px-3 py-2 text-xs text-stone-600">
                            {item.mediaFiles.length
                              ? `已上傳 ${item.mediaFiles.length}`
                              : "未上傳"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                getTaskStatusClasses(item.status)
                              )}
                            >
                              {getStatusLabel(item.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-stone-500">
                            {item.lastSyncedAt
                              ? formatDateTime(item.lastSyncedAt)
                              : "尚未同步"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {renderTaskActionMenu(item)}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="p-0">
                              {renderTaskDetails(item)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {visibleDrafts.length === 0 ? (
            <div className="mt-5 rounded-[8px] border border-dashed border-stone-200 bg-[#fbf7f1] p-6 text-center text-sm text-stone-500">
              {savedDrafts.length
                ? "目前篩選條件下沒有發文任務。"
                : "目前沒有發文任務。填寫上方表單後，點「新增發文任務」即可加入清單。"}
            </div>
          ) : (
            <div className="mt-4 grid gap-2 xl:hidden">
              {visibleDrafts.map((item) => {
                const isActive = editingDraftId === item.id;
                const isExpanded = expandedTaskId === item.id;

                return (
                  <article
                    key={item.id}
                    onClick={() =>
                      setExpandedTaskId((current) =>
                        current === item.id ? null : item.id
                      )
                    }
                    className={cn(
                      "cursor-pointer rounded-[8px] border bg-[#fffaf7] p-3 transition",
                      isActive
                        ? "border-[#8b6f5b] shadow-sm"
                        : "border-stone-100 hover:border-[#d7c4ae] hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(item.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleTaskSelection(item.id)}
                        aria-label={`選取 ${getTaskSummary(item)}`}
                        className="mt-1 size-4 shrink-0 accent-[#8b6f5b]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={cn(
                              "size-4 shrink-0 text-stone-400 transition-transform",
                              isExpanded && "rotate-90"
                            )}
                          />
                          <h3 className="truncate text-sm font-semibold text-stone-900">
                            {getTaskSummary(item)}
                          </h3>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          <span>{item.platforms.join(" / ") || "未選擇平台"}</span>
                          <span>·</span>
                          <span>{getModeLabel(item.mode)}</span>
                          <span>·</span>
                          <span>
                            {item.mediaFiles.length ? "已上傳媒體" : "未上傳"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              getTaskStatusClasses(item.status)
                          )}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                          <span className="text-xs text-stone-500">
                            {getTaskPublishTime(item)}
                          </span>
                          {item.lastSyncedAt && (
                            <span className="text-xs text-stone-400">
                              最後同步 {formatDateTime(item.lastSyncedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      {renderTaskActionMenu(item)}
                    </div>

                    {isExpanded && (
                      <div className="mt-3 border-t border-stone-100">
                        {renderTaskDetails(item)}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {facebookDeleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-5 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="facebook-delete-title"
        >
          <div className="w-full max-w-md rounded-[8px] border border-red-100 bg-white p-5 shadow-2xl md:p-6">
            <div className="flex size-11 items-center justify-center rounded-full bg-red-50 text-red-700">
              <Trash2 className="size-5" />
            </div>
            <h2
              id="facebook-delete-title"
              className="mt-4 text-xl font-semibold text-stone-900"
            >
              刪除 Facebook 貼文
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              確定要刪除這篇 Facebook
              貼文嗎？刪除後粉專上將看不到，且無法復原。後台仍會保留刪除紀錄。
            </p>
            <p className="mt-3 break-all rounded-[8px] bg-stone-50 px-3 py-2 text-xs text-stone-500">
              貼文編號：{facebookDeleteTarget.facebookPostId}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFacebookDeleteTarget(null)}
                disabled={Boolean(deletingFacebookDraftId)}
                className="h-11 rounded-full bg-white"
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={() => void confirmFacebookPostDelete()}
                disabled={Boolean(deletingFacebookDraftId)}
                className="h-11 rounded-full bg-red-700 text-white hover:bg-red-800"
              >
                {deletingFacebookDraftId ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {deletingFacebookDraftId ? "刪除中..." : "確認刪除"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
