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
  publishInstagramPost,
  publishThreadsPost,
  startInstagramOAuth,
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
const metaBusinessSuiteUrl = String(
  import.meta.env.VITE_META_BUSINESS_SUITE_URL ||
    "https://business.facebook.com/latest/composer"
).trim();

type PublishMode = "now" | "scheduled";
type Platform = "Facebook" | "Instagram" | "Threads";
type PlatformPublishStatus = "draft" | "published" | "failed";
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
  diagnostics?: undefined;
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
  instagramMediaId?: string;
  instagramPermalinkUrl?: string;
  instagramPublishedAt?: string;
  instagramStatus?: "draft" | "published" | "failed";
  threadsMediaId?: string;
  threadsPermalinkUrl?: string;
  threadsPublishedAt?: string;
  threadsStatus?: "draft" | "published" | "failed";
  threadsError?: string;
  imageUrl?: string;
  r2Key?: string;
  platformStatus?: {
    instagram?: PlatformPublishStatus;
    threads?: PlatformPublishStatus;
  };
  deletedAt?: string;
  deleteSource?: "admin" | "facebook" | "api";
  lastSyncedAt?: string;
  publishMethod?: "meta_business_suite" | "api";
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
    instagramMediaId: existingDraft?.instagramMediaId,
    instagramPermalinkUrl: existingDraft?.instagramPermalinkUrl,
    instagramPublishedAt: existingDraft?.instagramPublishedAt,
    instagramStatus:
      existingDraft?.instagramStatus ||
      (form.platforms.includes("Instagram") ? "draft" : undefined),
    threadsMediaId: existingDraft?.threadsMediaId,
    threadsPermalinkUrl: existingDraft?.threadsPermalinkUrl,
    threadsPublishedAt: existingDraft?.threadsPublishedAt,
    threadsStatus:
      existingDraft?.threadsStatus ||
      (form.platforms.includes("Threads") ? "draft" : undefined),
    threadsError: existingDraft?.threadsError,
    imageUrl: form.mediaFiles[0]?.publicUrl || undefined,
    r2Key: form.mediaFiles[0]?.key || undefined,
    platformStatus: {
      ...existingDraft?.platformStatus,
      ...(form.platforms.includes("Instagram") &&
      !existingDraft?.platformStatus?.instagram
        ? { instagram: "draft" as const }
        : {}),
      ...(form.platforms.includes("Threads") &&
      !existingDraft?.platformStatus?.threads
        ? { threads: "draft" as const }
        : {}),
    },
    deletedAt: existingDraft?.deletedAt,
    deleteSource: existingDraft?.deleteSource,
    lastSyncedAt: existingDraft?.lastSyncedAt,
    publishMethod: existingDraft?.publishMethod,
    publishError: existingDraft?.publishError || null,
    createdAt: existingDraft?.createdAt || now,
    updatedAt: now,
  };
}

function normalizeStoredDraft(value: unknown): StoredSocialDraft | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Omit<Partial<StoredSocialDraft>, "status"> & {
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
    instagramMediaId: source.instagramMediaId || undefined,
    instagramPermalinkUrl: source.instagramPermalinkUrl || undefined,
    instagramPublishedAt: source.instagramPublishedAt || undefined,
    instagramStatus:
      source.instagramStatus === "published" ||
      source.instagramStatus === "failed" ||
      source.instagramStatus === "draft"
        ? source.instagramStatus
        : undefined,
    threadsMediaId: source.threadsMediaId || undefined,
    threadsPermalinkUrl: source.threadsPermalinkUrl || undefined,
    threadsPublishedAt: source.threadsPublishedAt || undefined,
    threadsStatus:
      source.threadsStatus === "published" ||
      source.threadsStatus === "failed" ||
      source.threadsStatus === "draft"
        ? source.threadsStatus
        : undefined,
    threadsError: source.threadsError || undefined,
    imageUrl: source.imageUrl || undefined,
    r2Key: source.r2Key || undefined,
    platformStatus:
      source.platformStatus &&
      typeof source.platformStatus === "object" &&
      !Array.isArray(source.platformStatus)
        ? source.platformStatus
        : undefined,
    deletedAt: source.deletedAt || undefined,
    deleteSource: source.deleteSource || undefined,
    lastSyncedAt: source.lastSyncedAt || undefined,
    publishMethod:
      source.publishMethod === "meta_business_suite" ||
      source.publishMethod === "api"
        ? source.publishMethod
        : undefined,
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
  const [isStartingInstagramOAuth, setIsStartingInstagramOAuth] =
    useState(false);
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
  const [businessSuiteCopy, setBusinessSuiteCopy] = useState("");
  const [businessSuiteCopyTouched, setBusinessSuiteCopyTouched] =
    useState(false);
  const [copiedTarget, setCopiedTarget] = useState("");

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
  const hasDraftInput = Boolean(draft.title.trim() || draft.content.trim());
  const wantsFacebook = draft.platforms.includes("Facebook");
  const wantsInstagram = draft.platforms.includes("Instagram");
  const wantsThreads = draft.platforms.includes("Threads");
  const firstInstagramMedia = draft.mediaFiles[0];
  const firstSelectedFile = selectedFiles[0];
  const isSupportedInstagramImage = Boolean(
    firstInstagramMedia &&
      ["image/jpeg", "image/png", "image/webp"].includes(
        firstInstagramMedia.contentType
      )
  );
  const hasPendingLocalMedia =
    selectedFiles.length > 0 ||
    (draft.fileNames.length > 0 && draft.mediaFiles.length === 0);
  const isFacebookReady =
    metaConnections.facebook.status === "connected" &&
    facebookTokenDebug?.isValid === true;
  const isInstagramReady =
    metaConnections.instagram.status === "connected" &&
    metaConnections.instagram.diagnostics?.canPublishInstagram === true &&
    metaConnections.instagram.diagnostics?.publishingEnabled === true;
  const instagramMissingScopes =
    metaConnections.instagram.diagnostics?.missingScopes || [];
  const isThreadsReady =
    metaConnections.threads.status === "connected";
  const threadsText = [
    draft.content.trim() || draft.title.trim(),
    draft.hashtags.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  const threadsCharacterCount = Array.from(threadsText).length;
  const isPublishingCurrentDraft = publishingDraftId !== null;
  const publishButtonLabel =
    wantsFacebook && wantsInstagram && wantsThreads
      ? "發佈到 Facebook、Instagram 與 Threads"
      : wantsFacebook && wantsInstagram
        ? "發佈到 Facebook 與 Instagram"
        : wantsFacebook && wantsThreads
          ? "發佈到 Facebook 與 Threads"
          : wantsInstagram && wantsThreads
            ? "發佈到 Instagram 與 Threads"
            : wantsInstagram
              ? "發佈到 Instagram"
              : wantsFacebook
                ? "發佈到 Facebook"
                : wantsThreads
                  ? "發佈到 Threads"
                  : "請選擇發布平台";
  const publishDisabledReason = isPublishingCurrentDraft
    ? "發佈中，請稍候"
    : !hasDraftInput
      ? wantsThreads
        ? "請先輸入 Threads 發文內容"
        : "請先輸入發文內容"
      : !wantsFacebook && !wantsInstagram && !wantsThreads
        ? "請選擇 Facebook、Instagram 或 Threads"
      : wantsThreads && draft.publishMode === "scheduled"
        ? "Threads 第一版暫不支援排程發文"
      : wantsThreads && threadsCharacterCount > 500
        ? "Threads 發文內容不可超過 500 字"
      : wantsInstagram &&
          !firstInstagramMedia &&
          (firstSelectedFile?.type === "video/mp4" ||
            firstSelectedFile?.type.startsWith("video/"))
        ? "Instagram 第一版目前只支援單張圖片貼文，暫不支援影片"
      : wantsInstagram && !firstInstagramMedia && hasPendingLocalMedia
        ? "請先上傳圖片，取得公開圖片網址後才能發佈到 Instagram"
      : wantsInstagram && !firstInstagramMedia
        ? "Instagram 發文需要上傳 1 張圖片"
      : wantsInstagram &&
          (firstInstagramMedia.contentType === "video/mp4" ||
            firstInstagramMedia.contentType.startsWith("video/"))
        ? "Instagram 第一版目前只支援單張圖片貼文，暫不支援影片"
      : wantsInstagram && !isSupportedInstagramImage
        ? "Instagram 第一版僅支援 JPG、PNG 或 WebP 圖片"
      : wantsInstagram &&
          (!firstInstagramMedia.publicUrl ||
            !/^https:\/\//i.test(firstInstagramMedia.publicUrl))
        ? "請先上傳圖片，取得公開圖片網址後才能發佈到 Instagram"
      : wantsFacebook && !isFacebookReady
        ? "尚未連接 Facebook 粉專"
      : wantsInstagram && !isInstagramReady
        ? metaConnections.instagram.status === "connected"
          ? "Instagram OAuth 已連線，正式發文將於下一階段啟用"
          : instagramMissingScopes.includes("instagram_business_basic")
            ? "目前授權缺少 instagram_business_basic，請重新授權 Instagram"
            : instagramMissingScopes.includes(
                  "instagram_business_content_publish"
                )
              ? "目前授權缺少 instagram_business_content_publish，請重新授權 Instagram"
              : "尚未連接 Instagram 帳號"
      : wantsThreads && !isThreadsReady
        ? "尚未連接 Threads 帳號"
      : "";
  const isPublishDisabled = Boolean(publishDisabledReason);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("instagram_oauth");
    if (!oauthStatus) return;

    const oauthCode = params.get("reason");
    if (oauthStatus === "success") {
      setNotice("Instagram 授權成功，已連線：@mumbao.tw");
    } else {
      const messages: Record<string, string> = {
        missing_code:
          "Instagram 授權回傳缺少授權碼，請重新開始授權。",
        missing_state:
          "Instagram 授權回傳缺少安全驗證資訊，請重新開始授權。",
        state_cookie_missing:
          "Instagram 授權的 state cookie 遺失，請確認瀏覽器允許 Cookie 後重新授權。",
        state_mismatch:
          "Instagram 授權安全驗證不一致，請重新開始授權。",
        short_token_exchange_failed:
          "Instagram 短效 Token 交換失敗，請重新授權或檢查 Meta App 設定。",
        long_token_exchange_failed:
          "Instagram 長效 Token 交換失敗，請稍後重新授權。",
        instagram_me_failed:
          "Instagram 帳號資料讀取失敗，請確認授權權限後重新嘗試。",
        username_mismatch:
          "授權帳號不是 @mumbao.tw，請使用正確帳號重新授權。",
        credential_save_failed:
          "Instagram 授權成功，但 Supabase 憑證寫入失敗，請檢查 OAuth migration 與 service role 權限。",
        oauth_not_configured:
          "Instagram OAuth 環境變數尚未設定完整。",
        authorization_denied:
          "Instagram 授權已取消，尚未建立連線。",
        INSTAGRAM_AUTHORIZATION_DENIED:
          "Instagram 授權已取消，尚未建立連線。",
        INSTAGRAM_OAUTH_STATE_INVALID:
          "Instagram 授權驗證失敗，請重新開始授權。",
        INSTAGRAM_USERNAME_MISMATCH:
          "授權帳號不是 @mumbao.tw，請使用正確帳號重新授權。",
        INSTAGRAM_OAUTH_NOT_CONFIGURED:
          "Instagram OAuth 環境變數尚未設定完整。",
        INSTAGRAM_TOKEN_INVALID:
          "Instagram Token 無效或已過期，請重新授權。",
        INSTAGRAM_PERMISSION_DENIED:
          "Instagram 授權權限不足，請確認 Meta App 權限後重新授權。",
      };
      setNotice(
        messages[oauthCode || ""] ||
          "Instagram 授權失敗，請稍後重新嘗試。"
      );
    }

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }, []);

  const handleInstagramOAuthStart = async (forceReauth: boolean) => {
    if (!token || isStartingInstagramOAuth) return;

    setIsStartingInstagramOAuth(true);
    setNotice("");
    try {
      const result = await startInstagramOAuth(token, forceReauth);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "無法啟動 Instagram 授權，請稍後再試。"
      );
      setIsStartingInstagramOAuth(false);
    }
  };

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

  const buildCurrentDraft = (
    statusOverride?: DraftStatus,
    form: SocialDraftForm = draft
  ) => {
    const existingDraft = editingDraftId
      ? savedDrafts.find((item) => item.id === editingDraftId)
      : undefined;
    const generatedDraft = storedDraftFromForm(form, existingDraft);
    const nextDraft = statusOverride
      ? { ...generatedDraft, status: statusOverride }
      : generatedDraft;
    const nextDrafts = existingDraft
      ? savedDrafts.map((item) => (item.id === existingDraft.id ? nextDraft : item))
      : [nextDraft, ...savedDrafts];

    return {
      existingDraft,
      nextDraft,
      nextDrafts,
    };
  };

  const saveDraft = (event: FormEvent) => {
    event.preventDefault();

    if (!hasDraftInput) {
      setNotice("請先輸入發文內容。");
      return;
    }

    const { existingDraft, nextDraft, nextDrafts } =
      buildCurrentDraft("pending");
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
    setNotice("已儲存草稿");
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
    setBusinessSuiteCopy("");
    setBusinessSuiteCopyTouched(false);
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
      instagramMediaId: undefined,
      instagramPermalinkUrl: undefined,
      instagramPublishedAt: undefined,
      instagramStatus: item.platforms.includes("Instagram")
        ? "draft"
        : undefined,
      threadsMediaId: undefined,
      threadsPermalinkUrl: undefined,
      threadsPublishedAt: undefined,
      threadsStatus: item.platforms.includes("Threads")
        ? "draft"
        : undefined,
      threadsError: undefined,
      imageUrl: item.mediaFiles[0]?.publicUrl || undefined,
      r2Key: item.mediaFiles[0]?.key || undefined,
      platformStatus: {
        ...(item.platforms.includes("Instagram")
          ? { instagram: "draft" as const }
          : {}),
        ...(item.platforms.includes("Threads")
          ? { threads: "draft" as const }
          : {}),
      },
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

  const publishSavedDraftToFacebook = async (
    item: StoredSocialDraft,
    options?: {
      sourceDrafts?: StoredSocialDraft[];
      useCurrentForm?: boolean;
      skipConfirmation?: boolean;
    }
  ) => {
    const sourceDrafts = options?.sourceDrafts || savedDrafts;
    const isEditingThisTask =
      options?.useCurrentForm ?? editingDraftId === item.id;
    const latestItem = isEditingThisTask
      ? storedDraftFromForm(draft, item)
      : {
          ...item,
          content: item.content.trim(),
          hashtags: item.hashtags.trim(),
        };

    const publishContent =
      latestItem.content.trim() || latestItem.title.trim();

    if (!publishContent) {
      setNotice("請先輸入發文內容。");
      return;
    }

    if (!latestItem.platforms.includes("Facebook")) {
      setNotice("此任務尚未勾選 Facebook，請先編輯任務。");
      return;
    }

    const facebookMessage = [
      publishContent,
      latestItem.hashtags,
    ].filter(Boolean).join("\n\n");

    if (!options?.skipConfirmation) {
      const confirmed = window.confirm(
        `確定要發佈到 Facebook 粉絲專頁嗎？此動作會真的發文。\n\n發文內容：\n${facebookMessage}`
      );
      if (!confirmed) return;
    }

    const draftsWithLatestContent = sourceDrafts.map((draftItem) =>
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
        publishContent,
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

  const publishCurrentDraft = async () => {
    if (!hasDraftInput) {
      setNotice("請先輸入發文內容。");
      return;
    }

    if (publishDisabledReason) {
      setNotice(`${publishDisabledReason}。`);
      return;
    }

    const { nextDraft: generatedDraft, nextDrafts: generatedDrafts } =
      buildCurrentDraft(
      "pending",
      draft
    );
    const nextDraft: StoredSocialDraft = {
      ...generatedDraft,
      instagramStatus: wantsInstagram
        ? generatedDraft.instagramStatus || "draft"
        : generatedDraft.instagramStatus,
      threadsStatus: wantsThreads
        ? generatedDraft.threadsStatus || "draft"
        : generatedDraft.threadsStatus,
      imageUrl: firstInstagramMedia?.publicUrl || generatedDraft.imageUrl,
      r2Key: firstInstagramMedia?.key || generatedDraft.r2Key,
      platformStatus: {
        ...generatedDraft.platformStatus,
        ...(wantsInstagram &&
        !generatedDraft.platformStatus?.instagram
          ? { instagram: "draft" as const }
          : {}),
        ...(wantsThreads &&
        !generatedDraft.platformStatus?.threads
          ? { threads: "draft" as const }
          : {}),
      },
    };
    const nextDrafts = generatedDrafts.map((item) =>
      item.id === nextDraft.id ? nextDraft : item
    );
    const publishContent =
      nextDraft.content.trim() || nextDraft.title.trim();
    const facebookMessage = [publishContent, nextDraft.hashtags]
      .filter(Boolean)
      .join("\n\n");
    const confirmed = window.confirm(
      `確定要${publishButtonLabel}嗎？此動作會真的發文。\n\n發文內容：\n${facebookMessage}`
    );
    if (!confirmed) return;

    saveStoredDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    setEditingDraftId(nextDraft.id);
    const nextForm = formFromStoredDraft(nextDraft);
    setDraft(nextForm);
    setPreview(nextForm);
    setPublishingDraftId(nextDraft.id);
    setNotice("");

    let publishedDraft = nextDraft;
    const failures: Array<{
      platform: "Facebook" | "Instagram" | "Threads";
      error: Error & {
        errorCode?: string;
        metaError?: FacebookPublishErrorDetails | null;
      };
    }> = [];
    let successCount = 0;

    try {
      await syncSocialPosts(token, nextDrafts);

      if (wantsFacebook) {
        try {
          const facebookResult = await publishFacebookPost(
            token,
            nextDraft.id,
            publishContent,
            nextDraft.hashtags
          );
          successCount += 1;
          publishedDraft = {
            ...publishedDraft,
            facebookPostId: facebookResult.facebookPostId,
            facebookPermalinkUrl:
              facebookResult.facebookPermalinkUrl || undefined,
            publishedAt: facebookResult.createdAt,
          };
        } catch (error) {
          failures.push({
            platform: "Facebook",
            error: error as Error & {
              errorCode?: string;
              metaError?: FacebookPublishErrorDetails | null;
            },
          });
        }
      }

      if (wantsInstagram) {
        try {
          const instagramResult = await publishInstagramPost(
            token,
            nextDraft.id,
            firstInstagramMedia!.publicUrl,
            firstInstagramMedia!.key,
            nextDraft.title,
            nextDraft.content,
            nextDraft.hashtags
          );
          successCount += 1;
          publishedDraft = {
            ...publishedDraft,
            instagramMediaId: instagramResult.instagramMediaId,
            instagramPermalinkUrl:
              instagramResult.instagramPermalinkUrl || undefined,
            instagramPublishedAt: instagramResult.createdAt,
            instagramStatus: "published",
            imageUrl: instagramResult.imageUrl,
            r2Key: instagramResult.r2Key || firstInstagramMedia!.key,
            platformStatus: {
              ...publishedDraft.platformStatus,
              instagram: "published",
            },
            publishedAt:
              publishedDraft.publishedAt || instagramResult.createdAt,
          };
        } catch (error) {
          const instagramError = error as Error & {
            errorCode?: string;
            metaError?: FacebookPublishErrorDetails | null;
          };
          failures.push({
            platform: "Instagram",
            error: instagramError,
          });
          publishedDraft = {
            ...publishedDraft,
            instagramStatus: "failed",
            imageUrl: firstInstagramMedia!.publicUrl,
            r2Key: firstInstagramMedia!.key,
            platformStatus: {
              ...publishedDraft.platformStatus,
              instagram: "failed",
            },
          };
        }
      }

      if (wantsThreads) {
        try {
          const threadsResult = await publishThreadsPost(
            token,
            nextDraft.id,
            nextDraft.title,
            nextDraft.content,
            nextDraft.hashtags
          );
          successCount += 1;
          publishedDraft = {
            ...publishedDraft,
            threadsMediaId: threadsResult.threadsMediaId,
            threadsPermalinkUrl:
              threadsResult.threadsPermalinkUrl || undefined,
            threadsPublishedAt: threadsResult.createdAt,
            threadsStatus: "published",
            threadsError: undefined,
            platformStatus: {
              ...publishedDraft.platformStatus,
              threads: "published",
            },
            publishedAt:
              publishedDraft.publishedAt || threadsResult.createdAt,
          };
        } catch (error) {
          const threadsError = error as Error & {
            errorCode?: string;
            metaError?: FacebookPublishErrorDetails | null;
          };
          failures.push({
            platform: "Threads",
            error: threadsError,
          });
          publishedDraft = {
            ...publishedDraft,
            threadsStatus: "failed",
            threadsError:
              threadsError.message || "Threads 發文失敗，請稍後再試。",
            platformStatus: {
              ...publishedDraft.platformStatus,
              threads: "failed",
            },
          };
        }
      }

      const updatedAt = new Date().toISOString();
      const firstFailure = failures[0];
      const finalDraft: StoredSocialDraft = {
        ...publishedDraft,
        status: successCount > 0 ? "published" : "failed",
        publishError: firstFailure
          ? {
              errorCode:
                firstFailure.error.errorCode ||
                `${firstFailure.platform.toUpperCase()}_PUBLISH_FAILED`,
              errorMessage: `${firstFailure.platform}：${
                firstFailure.error.message || "發文失敗，請稍後再試。"
              }`,
              metaError: firstFailure.error.metaError || null,
            }
          : null,
        updatedAt,
      };
      const finalDrafts = nextDrafts.map((item) =>
        item.id === finalDraft.id ? finalDraft : item
      );

      persistDrafts(finalDrafts);
      setDraft(formFromStoredDraft(finalDraft));
      setPreview(formFromStoredDraft(finalDraft));

      if (!failures.length) {
        setNotice(`${publishButtonLabel}成功。`);
      } else if (successCount > 0) {
        setNotice(
          `部分平台發布成功；${failures
            .map(
              ({ platform, error }) =>
                `${platform}：${error.message || "發布失敗"}`
            )
            .join("；")}`
        );
      } else {
        setNotice(
          failures
            .map(
              ({ platform, error }) =>
                `${platform} 發文失敗：${error.message || "請稍後再試。"}`
            )
            .join("；")
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "發文任務同步失敗。";
      setNotice(`無法開始發布：${message}`);
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

  const buildBusinessSuiteCopy = (form: SocialDraftForm) =>
    [form.content.trim() || form.title.trim(), form.hashtags.trim()]
      .filter(Boolean)
      .join("\n\n");

  const getBusinessSuiteCopyForItem = (item: StoredSocialDraft) =>
    [item.content.trim() || item.title.trim(), item.hashtags.trim()]
      .filter(Boolean)
      .join("\n\n");

  const generateBusinessSuiteCopy = () => {
    const nextCopy = buildBusinessSuiteCopy(draft);
    if (!nextCopy) {
      setNotice("請先填寫發文內容或標題，再產生 Meta Business Suite 文案。");
      return;
    }

    if (
      businessSuiteCopyTouched &&
      businessSuiteCopy.trim() &&
      businessSuiteCopy !== nextCopy
    ) {
      const confirmed = window.confirm(
        "目前的 Meta Business Suite 文案已手動修改，要用表單內容重新產生並覆蓋嗎？"
      );
      if (!confirmed) return;
    }

    setBusinessSuiteCopy(nextCopy);
    setBusinessSuiteCopyTouched(false);
    setNotice("已產生 Meta Business Suite 建議文案。");
  };

  const copyText = async (text: string, target: string, successMessage: string) => {
    if (!text.trim()) {
      setNotice("沒有可複製的內容。");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setNotice(successMessage);
      window.setTimeout(() => {
        setCopiedTarget((current) => (current === target ? "" : current));
      }, 1600);
    } catch {
      setNotice("瀏覽器無法寫入剪貼簿，請手動複製。");
    }
  };

  const removeMediaFile = (mediaKey: string) => {
    const nextMediaFiles = draft.mediaFiles.filter((media) => media.key !== mediaKey);
    const nextFileNames = nextMediaFiles.map((media) => media.fileName);
    const nextDraft = {
      ...draft,
      mediaFiles: nextMediaFiles,
      fileNames: nextFileNames,
    };

    setDraft(nextDraft);
    setPreview(nextDraft);
    setNotice("已移除這張暫存圖片。");
  };

  const applyBusinessSuitePublishedState = (
    item: StoredSocialDraft,
    publishedAt: string
  ): StoredSocialDraft => ({
    ...item,
    status: "published",
    publishedAt,
    updatedAt: publishedAt,
    publishMethod: "meta_business_suite",
    publishError: null,
    deletedAt: undefined,
    deleteSource: undefined,
    platformStatus: {
      ...item.platformStatus,
      ...(item.platforms.includes("Instagram")
        ? { instagram: "published" as const }
        : {}),
      ...(item.platforms.includes("Threads")
        ? { threads: "published" as const }
        : {}),
    },
    instagramStatus: item.platforms.includes("Instagram")
      ? "published"
      : item.instagramStatus,
    instagramPublishedAt: item.platforms.includes("Instagram")
      ? publishedAt
      : item.instagramPublishedAt,
    threadsStatus: item.platforms.includes("Threads")
      ? "published"
      : item.threadsStatus,
    threadsPublishedAt: item.platforms.includes("Threads")
      ? publishedAt
      : item.threadsPublishedAt,
  });

  const markCurrentDraftPublishedByBusinessSuite = () => {
    if (!hasDraftInput) {
      setNotice("請先填寫發文內容或標題，再標記發布。");
      return;
    }

    const publishedAt = new Date().toISOString();
    const { nextDraft, nextDrafts } = buildCurrentDraft("published", draft);
    const finalDraft = applyBusinessSuitePublishedState(nextDraft, publishedAt);
    const finalDrafts = nextDrafts.map((item) =>
      item.id === finalDraft.id ? finalDraft : item
    );
    const nextForm = formFromStoredDraft(finalDraft);

    persistDrafts(finalDrafts);
    setEditingDraftId(finalDraft.id);
    setDraft(nextForm);
    setPreview(nextForm);
    setNotice("已標記為已用 Meta Business Suite 發布。");
  };

  const markSavedDraftPublishedByBusinessSuite = (item: StoredSocialDraft) => {
    const publishedAt = new Date().toISOString();
    const finalDraft = applyBusinessSuitePublishedState(item, publishedAt);
    const nextDrafts = savedDrafts.map((draftItem) =>
      draftItem.id === item.id ? finalDraft : draftItem
    );

    persistDrafts(nextDrafts);
    setNotice("已標記為已用 Meta Business Suite 發布。");
  };

  const getPublishMethodLabel = (item: StoredSocialDraft) =>
    item.publishMethod === "meta_business_suite" || !item.facebookPostId
      ? "Meta Business Suite"
      : "Meta API";

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

            {item.instagramPermalinkUrl && (
              <a
                href={item.instagramPermalinkUrl}
                target="_blank"
                rel="noreferrer"
                onClick={closeMenu}
                className={actionClasses}
              >
                <ExternalLink className="size-4" />
                查看 Instagram 文章
              </a>
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
        {item.instagramPublishedAt && (
          <div>
            <dt className="inline text-stone-400">Instagram 發布時間：</dt>
            <dd className="inline">
              {formatDateTime(item.instagramPublishedAt)}
            </dd>
          </div>
        )}
        {item.instagramMediaId && (
          <div>
            <dt className="inline text-stone-400">Instagram 媒體編號：</dt>
            <dd className="inline break-all">{item.instagramMediaId}</dd>
          </div>
        )}
        {item.instagramPermalinkUrl && (
          <div>
            <dt className="inline text-stone-400">Instagram 文章連結：</dt>
            <dd className="inline">
              <a
                href={item.instagramPermalinkUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[#8b6f5b] underline underline-offset-2"
              >
                {item.instagramPermalinkUrl}
              </a>
            </dd>
          </div>
        )}
        {item.threadsStatus && (
          <div>
            <dt className="inline text-stone-400">Threads 狀態：</dt>
            <dd className="inline">
              {item.threadsStatus === "published"
                ? "已發布"
                : item.threadsStatus === "failed"
                  ? "發布失敗"
                  : "草稿"}
            </dd>
          </div>
        )}
        {item.threadsPublishedAt && (
          <div>
            <dt className="inline text-stone-400">Threads 發布時間：</dt>
            <dd className="inline">
              {formatDateTime(item.threadsPublishedAt)}
            </dd>
          </div>
        )}
        {item.threadsMediaId && (
          <div>
            <dt className="inline text-stone-400">Threads 媒體編號：</dt>
            <dd className="inline break-all">{item.threadsMediaId}</dd>
          </div>
        )}
        {item.threadsPermalinkUrl && (
          <div>
            <dt className="inline text-stone-400">Threads 文章連結：</dt>
            <dd className="inline">
              <a
                href={item.threadsPermalinkUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[#8b6f5b] underline underline-offset-2"
              >
                {item.threadsPermalinkUrl}
              </a>
            </dd>
          </div>
        )}
        {item.threadsError && (
          <div className="mt-1 rounded-[6px] bg-orange-50 px-3 py-2 text-orange-700">
            Threads 發布失敗：{item.threadsError}
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

  const primaryMedia = draft.mediaFiles[0];
  const helperCopy = businessSuiteCopy || buildBusinessSuiteCopy(draft);

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-6 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Social Publishing Assistant
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              社群發布助手
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
              整理慢慢蒔光的文案與圖片，再到 Meta Business Suite 手動發布或排程。
            </p>
          </div>
          <Link
            href="/admin/shop"
            className="inline-flex h-10 items-center justify-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-[#8b6f5b] transition hover:bg-[#fbf7f1]"
          >
            回到後台
          </Link>
        </div>
      </header>

      <AdminShopNav current="social" />

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8 md:py-8">
        <section className="rounded-[8px] border border-[#eadfce] bg-[#fffaf3] px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
              <p className="text-sm leading-6 text-stone-700">
                目前使用安全半自動流程：整理文案與圖片後，前往 Meta Business Suite 發布。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-500">
                Meta API：未啟用
              </span>
              <button
                type="button"
                aria-expanded={isMetaDetailsExpanded}
                onClick={() =>
                  setIsMetaDetailsExpanded((isExpanded) => !isExpanded)
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-[#8b6f5b] transition hover:bg-[#fbf7f1]"
              >
                API 狀態
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    isMetaDetailsExpanded && "rotate-180"
                  )}
                />
              </button>
            </div>
          </div>

          {isMetaDetailsExpanded && (
            <div className="mt-4 border-t border-[#eadfce] pt-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs leading-5 text-stone-500">
                  Meta API 狀態只供診斷；目前主流程不會呼叫 Facebook、Instagram 或 Threads 發文 API。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={refreshMetaConnections}
                  disabled={isCheckingMeta || isCheckingFacebookToken}
                  className="h-9 rounded-full bg-white px-4 text-xs"
                >
                  {isCheckingMeta || isCheckingFacebookToken ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  重新檢查
                </Button>
              </div>
              {metaCheckError && (
                <p className="mt-3 rounded-[8px] border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  {metaCheckError}
                </p>
              )}
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-2 border-b border-stone-100 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                  Content
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-stone-900">
                  發文內容
                </h2>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateBusinessSuiteCopy}
                  className="h-10 rounded-full bg-white px-4 text-sm"
                >
                  <Sparkles className="size-4" />
                  產生建議文案
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearForm}
                  className="h-10 rounded-full bg-white px-4 text-sm"
                >
                  清空
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="social-title">
                  <FieldLabel>發文標題</FieldLabel>
                </label>
                <input
                  id="social-title"
                  value={draft.title}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder="例如：慢慢蒔光週末早晨"
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
                  placeholder="寫下今天要發布的主要內容。"
                  rows={7}
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
                  placeholder="#慢慢蒔光 #STimeVilla #台南民宿"
                  className="h-11 w-full rounded-[8px] border border-stone-200 bg-[#fffaf7] px-4 text-base outline-none transition focus:border-[#8b6f5b] focus:bg-white"
                />
              </div>

              <div className="grid gap-2">
                <FieldLabel>預計發布到</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {platformOptions.map((platform) => (
                    <label
                      key={platform}
                      className={cn(
                        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-medium transition",
                        draft.platforms.includes(platform)
                          ? "border-[#8b6f5b] bg-[#fffaf3] text-stone-800"
                          : "border-stone-200 bg-white text-stone-500 hover:bg-[#fbf7f1]"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={draft.platforms.includes(platform)}
                        onChange={() => togglePlatform(platform)}
                        className="size-3.5 accent-[#8b6f5b]"
                      />
                      {platform}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <label htmlFor="business-suite-copy">
                  <FieldLabel>建議文案</FieldLabel>
                </label>
                <textarea
                  id="business-suite-copy"
                  value={businessSuiteCopy}
                  onChange={(event) => {
                    setBusinessSuiteCopy(event.target.value);
                    setBusinessSuiteCopyTouched(true);
                  }}
                  placeholder="按「產生建議文案」後，可在這裡微調再複製。"
                  rows={5}
                  className="w-full resize-y rounded-[8px] border border-stone-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-[#8b6f5b]"
                />
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffaf3] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <FieldLabel>圖片 / 影片選擇</FieldLabel>
                    <p className="mt-1 text-xs text-stone-500">
                      選擇圖片後先上傳暫存，再到 Meta Business Suite 使用。
                    </p>
                  </div>
                  <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[#8b6f5b] ring-1 ring-stone-200 transition hover:bg-[#f4ece2]">
                    選擇圖片
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

                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {selectedFiles.map((file) => (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex flex-col gap-1 rounded-[8px] bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="break-all font-medium text-stone-700">
                          {file.name}
                        </span>
                        <span className="shrink-0 text-xs text-stone-500">
                          {file.type || "未知格式"} / {formatFileSize(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  type="button"
                  onClick={uploadSelectedFiles}
                  disabled={!selectedFiles.length || isUploading}
                  className="mt-4 h-10 rounded-full bg-[#8b6f5b] px-4 text-white hover:bg-[#765d4a]"
                >
                  {isUploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UploadCloud className="size-4" />
                  )}
                  {isUploading ? "上傳中..." : "上傳暫存"}
                </Button>

                {uploadError && (
                  <p className="mt-3 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {uploadError}
                  </p>
                )}

                {draft.mediaFiles.length > 0 && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {draft.mediaFiles.map((media) => (
                      <article
                        key={media.key}
                        className="overflow-hidden rounded-[8px] border border-stone-100 bg-white text-sm"
                      >
                        {media.contentType.startsWith("image/") ? (
                          <img
                            src={media.publicUrl}
                            alt={media.fileName}
                            className="h-36 w-full bg-[#fbf7f1] object-contain"
                          />
                        ) : media.contentType === "video/mp4" ? (
                          <video
                            src={media.publicUrl}
                            controls
                            preload="metadata"
                            className="h-36 w-full bg-black object-contain"
                          >
                            {media.fileName}
                          </video>
                        ) : null}
                        <div className="space-y-3 p-3">
                          <p className="break-all font-medium text-stone-800">
                            {media.fileName}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <a
                              href={media.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 items-center justify-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-[#8b6f5b] transition hover:bg-[#fbf7f1]"
                            >
                              開啟
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                void copyText(
                                  media.publicUrl,
                                  `media-${media.key}`,
                                  "已複製圖片網址。"
                                )
                              }
                              className="inline-flex h-9 items-center justify-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-[#8b6f5b] transition hover:bg-[#fbf7f1]"
                            >
                              {copiedTarget === `media-${media.key}`
                                ? "已複製"
                                : "複製網址"}
                            </button>
                            <a
                              href={media.publicUrl}
                              download={media.fileName}
                              className="inline-flex h-9 items-center justify-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-[#8b6f5b] transition hover:bg-[#fbf7f1]"
                            >
                              下載
                            </a>
                            <button
                              type="button"
                              onClick={() => removeMediaFile(media.key)}
                              className="inline-flex h-9 items-center justify-center rounded-full border border-red-100 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              移除
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {notice && (
                <div className="flex items-center gap-2 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  {notice}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
            <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-stone-900">
                發布助手
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                複製文案後，開啟 Meta Business Suite，貼上文字與圖片，再回來標記已發布。
              </p>
              <div className="mt-4 grid gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void copyText(helperCopy, "business-copy", "已複製")
                  }
                  className="h-11 rounded-full bg-white px-4"
                >
                  <Clipboard className="size-4" />
                  {copiedTarget === "business-copy" ? "已複製" : "複製文案"}
                </Button>
                {metaBusinessSuiteUrl ? (
                  <a
                    href={metaBusinessSuiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-[#8b6f5b] transition hover:bg-[#fbf7f1]"
                  >
                    <ExternalLink className="size-4" />
                    開啟 Meta Business Suite
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-11 items-center justify-center rounded-full border border-stone-200 bg-stone-100 px-4 text-sm font-semibold text-stone-400"
                  >
                    尚未設定連結
                  </button>
                )}
                {primaryMedia ? (
                  <a
                    href={primaryMedia.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-[#8b6f5b] transition hover:bg-[#fbf7f1]"
                  >
                    <ExternalLink className="size-4" />
                    開啟圖片
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-11 items-center justify-center rounded-full border border-stone-200 bg-stone-100 px-4 text-sm font-semibold text-stone-400"
                  >
                    開啟圖片
                  </button>
                )}
                <Button
                  type="button"
                  onClick={markCurrentDraftPublishedByBusinessSuite}
                  className="h-11 rounded-full bg-[#8b6f5b] px-4 text-white hover:bg-[#765d4a]"
                >
                  <CheckCircle2 className="size-4" />
                  標記已發布
                </Button>
              </div>
            </section>

            <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3">
                <h2 className="text-lg font-semibold text-stone-900">
                  發文預覽
                </h2>
                <Sparkles className="size-4 text-[#8b6f5b]" />
              </div>
              <div className="mt-4 space-y-3">
                <p className="text-base font-semibold text-stone-900">
                  {preview.title || draft.title || "尚未填寫標題"}
                </p>
                <p className="line-clamp-4 whitespace-pre-wrap rounded-[8px] bg-[#fbf7f1] p-3 text-sm leading-6 text-stone-700">
                  {preview.content || draft.content || "文案會顯示在這裡。"}
                </p>
                {(preview.hashtags || draft.hashtags) && (
                  <p className="text-sm leading-6 text-[#8b6f5b]">
                    {preview.hashtags || draft.hashtags}
                  </p>
                )}
                {(preview.mediaFiles[0] || primaryMedia) && (
                  <div className="overflow-hidden rounded-[8px] border border-stone-100 bg-[#fbf7f1]">
                    {(preview.mediaFiles[0] || primaryMedia)?.contentType.startsWith(
                      "image/"
                    ) ? (
                      <img
                        src={(preview.mediaFiles[0] || primaryMedia)?.publicUrl}
                        alt={(preview.mediaFiles[0] || primaryMedia)?.fileName}
                        className="max-h-48 w-full bg-white object-contain"
                      />
                    ) : (
                      <div className="p-4 text-sm text-stone-500">
                        已選擇影片素材
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-2 border-b border-stone-100 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Records
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-900">
                發文紀錄
              </h2>
            </div>
            <p className="text-sm text-stone-500">
              目前紀錄主要儲存在此瀏覽器。
            </p>
          </div>

          {visibleDrafts.length === 0 ? (
            <div className="mt-5 rounded-[8px] border border-dashed border-stone-200 bg-[#fbf7f1] p-6 text-center text-sm text-stone-500">
              目前沒有發文紀錄。
            </div>
          ) : (
            <div className="mt-5 divide-y divide-stone-100">
              {visibleDrafts.map((item) => {
                const summary = getTaskSummary(item);
                const copy = getBusinessSuiteCopyForItem(item);
                const isExpanded = expandedTaskId === item.id;
                const statusLabel =
                  item.status === "published" &&
                  item.publishMethod === "meta_business_suite"
                    ? "已用 Meta Business Suite 發布"
                    : getStatusLabel(item.status);

                return (
                  <article key={item.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-stone-900">
                            {summary}
                          </h3>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              getTaskStatusClasses(item.status)
                            )}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-stone-500">
                          {formatDateTime(item.createdAt)} ·{" "}
                          {item.platforms.join(" / ") || "未指定平台"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setExpandedTaskId((current) =>
                              current === item.id ? null : item.id
                            )
                          }
                          className="h-9 rounded-full bg-white px-3 text-xs"
                        >
                          {isExpanded ? "收合" : "查看"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void copyText(copy, `task-copy-${item.id}`, "已複製")
                          }
                          className="h-9 rounded-full bg-white px-3 text-xs"
                        >
                          <Copy className="size-3.5" />
                          {copiedTarget === `task-copy-${item.id}`
                            ? "已複製"
                            : "複製"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => markSavedDraftPublishedByBusinessSuite(item)}
                          className="h-9 rounded-full bg-white px-3 text-xs"
                        >
                          <CheckCircle2 className="size-3.5" />
                          標記已發布
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => deleteSavedDraft(item)}
                          className="h-9 rounded-full border-red-100 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="size-3.5" />
                          刪除
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 rounded-[8px] bg-[#fbf7f1] p-4 text-sm leading-7 text-stone-700">
                        <p className="whitespace-pre-wrap">
                          {copy || "這筆紀錄沒有文案內容。"}
                        </p>
                        {item.mediaFiles.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.mediaFiles.map((media) => (
                              <a
                                key={media.key}
                                href={media.publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 items-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-[#8b6f5b] hover:bg-[#fffaf3]"
                              >
                                開啟圖片
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );



  return null;
}
