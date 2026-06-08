import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Edit3,
  FileImage,
  LockKeyhole,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import AdminShopNav from "@/components/shop/AdminShopNav";
import { Button } from "@/components/ui/button";
import { getAdminToken } from "@/lib/shop/adminAuth";
import { cn } from "@/lib/utils";

const legacySocialDraftStorageKey = "mumbao_social_post_draft";
const socialDraftsStorageKey = "mumbao_social_post_drafts";

type PublishMode = "now" | "scheduled";
type Platform = "Facebook" | "Instagram" | "Threads";
type DraftStatus =
  | "pending"
  | "scheduled"
  | "published"
  | "partial_success"
  | "failed"
  | "cancelled";

type SocialDraftForm = {
  title: string;
  content: string;
  hashtags: string;
  platforms: Platform[];
  publishMode: PublishMode;
  scheduledAt: string;
  fileNames: string[];
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
};

function createDraftId() {
  return `social-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    content: form.content,
    hashtags: form.hashtags,
    platforms: form.platforms,
    mode: form.publishMode,
    scheduledAt: form.scheduledAt,
    status: getDraftStatus(form.publishMode, form.scheduledAt),
    mediaFileNames: form.fileNames,
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
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now,
  };
}

function loadStoredDrafts(): StoredSocialDraft[] {
  try {
    const rawDrafts = localStorage.getItem(socialDraftsStorageKey);

    if (rawDrafts) {
      const parsed = JSON.parse(rawDrafts);
      return Array.isArray(parsed)
        ? parsed.map(normalizeStoredDraft).filter(Boolean) as StoredSocialDraft[]
        : [];
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
  const latestDraft = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return {
    drafts,
    activeDraftId: latestDraft?.id || null,
    form: latestDraft ? formFromStoredDraft(latestDraft) : defaultDraft,
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

function getModeLabel(mode: PublishMode) {
  return mode === "scheduled" ? "排程發文" : "立即發文";
}

function getStatusLabel(status: DraftStatus) {
  const labels: Record<DraftStatus, string> = {
    pending: "待發文",
    scheduled: "排程中",
    published: "已發文",
    partial_success: "部分成功",
    failed: "發文失敗",
    cancelled: "已取消",
  };

  return labels[status] || "待發文";
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

  const platformOptions: Platform[] = useMemo(
    () => ["Facebook", "Instagram", "Threads"],
    []
  );

  const sortedDrafts = useMemo(
    () => [...savedDrafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedDrafts]
  );

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
    const fileNames = Array.from(event.target.files || []).map((file) => file.name);
    updateDraft("fileNames", fileNames);
  };

  const saveDraft = (event: FormEvent) => {
    event.preventDefault();

    const existingDraft = editingDraftId
      ? savedDrafts.find((item) => item.id === editingDraftId)
      : undefined;
    const nextDraft = storedDraftFromForm(draft, existingDraft);
    const nextDrafts = existingDraft
      ? savedDrafts.map((item) => (item.id === existingDraft.id ? nextDraft : item))
      : [nextDraft, ...savedDrafts];

    saveStoredDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    setEditingDraftId(nextDraft.id);
    setPreview(draft);
    setNotice(existingDraft ? "草稿已更新。" : "草稿已儲存。");
  };

  const updatePreview = () => {
    setPreview(draft);
    setNotice("預覽已更新。這只是測試預覽，尚未發文。");
  };

  const editSavedDraft = (item: StoredSocialDraft) => {
    const nextForm = formFromStoredDraft(item);
    setDraft(nextForm);
    setPreview(nextForm);
    setEditingDraftId(item.id);
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
      createdAt: now,
      updatedAt: now,
    };
    const nextDrafts = [copiedDraft, ...savedDrafts];

    saveStoredDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    setNotice("已複製成一筆新草稿。");
  };

  const deleteSavedDraft = (item: StoredSocialDraft) => {
    const confirmed = window.confirm(`確定要刪除「${item.title || "未命名草稿"}」嗎？`);
    if (!confirmed) return;

    const nextDrafts = savedDrafts.filter((draftItem) => draftItem.id !== item.id);
    saveStoredDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);

    if (editingDraftId === item.id) {
      setEditingDraftId(null);
      setDraft(defaultDraft);
      setPreview(defaultDraft);
    }

    setNotice("草稿已刪除。");
  };

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
            <p className="font-semibold text-stone-800">第一版狀態</p>
            <p>只保存草稿與預覽，不會發文、不會上傳檔案。</p>
          </div>
        </div>
      </header>

      <AdminShopNav current="social" />

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8 md:py-8">
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
                      第一版只顯示檔名，不會上傳到 Cloudflare R2。
                    </p>
                  </div>
                </div>
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#8b6f5b] shadow-sm ring-1 ring-stone-200 transition hover:bg-[#f4ece2]">
                  選擇檔案
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFilesChange}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {draft.fileNames.length > 0 ? (
                  draft.fileNames.map((fileName) => (
                    <span
                      key={fileName}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600"
                    >
                      {fileName}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-stone-400">尚未選擇圖片或影片。</p>
                )}
              </div>
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
                {editingDraftId ? "更新草稿" : "儲存草稿"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={updatePreview}
                className="h-11 rounded-full bg-white px-6"
              >
                測試預覽
              </Button>
              <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
                <Button type="button" disabled className="h-11 rounded-full px-6">
                  <Send className="size-4" />
                  之後發文
                </Button>
                <p className="text-xs text-stone-400">Meta API 串接後啟用</p>
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
                  已選圖片 / 影片
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {preview.fileNames.length > 0 ? (
                    preview.fileNames.map((fileName) => (
                      <span
                        key={fileName}
                        className="rounded-full bg-[#fbf7f1] px-3 py-1.5 text-xs font-medium text-stone-600"
                      >
                        {fileName}
                      </span>
                    ))
                  ) : (
                    <EmptyPreviewLine>尚未選擇檔案</EmptyPreviewLine>
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
            目前第一版僅保存發文任務，不會真的發文；串接 Meta API 後會顯示發文成功或失敗結果。
          </p>

          {sortedDrafts.length === 0 ? (
            <div className="mt-5 rounded-[8px] border border-dashed border-stone-200 bg-[#fbf7f1] p-6 text-center text-sm text-stone-500">
              目前沒有發文任務。填寫上方表單後，點「儲存草稿」即可加入清單。
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {sortedDrafts.map((item) => {
                const isActive = editingDraftId === item.id;
                const title = item.title || "未命名草稿";

                return (
                  <article
                    key={item.id}
                    className={cn(
                      "rounded-[8px] border bg-[#fffaf7] p-4 transition md:flex md:items-start md:justify-between md:gap-5",
                      isActive
                        ? "border-[#8b6f5b] shadow-sm"
                        : "border-stone-100 hover:border-[#d7c4ae] hover:shadow-sm"
                    )}
                  >
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-stone-900">
                          {title}
                        </h3>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            item.status === "scheduled"
                              ? "bg-[#fbf0e4] text-[#8b6f5b]"
                              : "bg-stone-100 text-stone-600"
                          )}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {item.platforms.length > 0 ? (
                          item.platforms.map((platform) => (
                            <span
                              key={platform}
                              className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-600"
                            >
                              {platform}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-stone-400">尚未選擇平台</span>
                        )}
                      </div>

                      <div className="grid gap-2 text-sm text-stone-600 sm:grid-cols-2 lg:grid-cols-4">
                        <p>
                          <span className="text-stone-400">發文模式：</span>
                          {getModeLabel(item.mode)}
                        </p>
                        <p>
                          <span className="text-stone-400">排程時間：</span>
                          {item.scheduledAt ? formatDateTime(item.scheduledAt) : "未排程"}
                        </p>
                        <p>
                          <span className="text-stone-400">最後更新：</span>
                          {formatDateTime(item.updatedAt)}
                        </p>
                        <p>
                          <span className="text-stone-400">媒體：</span>
                          {item.mediaFileNames.length > 0
                            ? `有檔名（${item.mediaFileNames.length} 個）`
                            : "未上傳"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 md:mt-0 md:w-[240px] md:shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => editSavedDraft(item)}
                        className="h-10 rounded-full bg-white px-3"
                      >
                        <Edit3 className="size-4" />
                        編輯
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => copySavedDraft(item)}
                        className="h-10 rounded-full bg-white px-3"
                      >
                        <Copy className="size-4" />
                        複製
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => deleteSavedDraft(item)}
                        className="h-10 rounded-full bg-white px-3 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="size-4" />
                        刪除
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
