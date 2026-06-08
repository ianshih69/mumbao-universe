import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CalendarClock,
  CheckCircle2,
  FileImage,
  LockKeyhole,
  Send,
  Sparkles,
} from "lucide-react";
import AdminShopNav from "@/components/shop/AdminShopNav";
import { Button } from "@/components/ui/button";
import { getAdminToken } from "@/lib/shop/adminAuth";
import { cn } from "@/lib/utils";

const socialDraftStorageKey = "mumbao_social_post_draft";

type PublishMode = "now" | "scheduled";
type Platform = "Facebook" | "Instagram" | "Threads";

type SocialDraft = {
  title: string;
  content: string;
  hashtags: string;
  platforms: Platform[];
  publishMode: PublishMode;
  scheduledAt: string;
  fileNames: string[];
};

const defaultDraft: SocialDraft = {
  title: "",
  content: "",
  hashtags: "",
  platforms: ["Facebook", "Instagram"],
  publishMode: "now",
  scheduledAt: "",
  fileNames: [],
};

function loadSavedDraft(): SocialDraft {
  try {
    const rawDraft = localStorage.getItem(socialDraftStorageKey);
    if (!rawDraft) return defaultDraft;

    return {
      ...defaultDraft,
      ...JSON.parse(rawDraft),
      fileNames: [],
    };
  } catch {
    return defaultDraft;
  }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold text-stone-800">{children}</span>;
}

function EmptyPreviewLine({ children }: { children: React.ReactNode }) {
  return <span className="text-stone-400">{children}</span>;
}

export default function AdminShopSocial() {
  const [token] = useState(() => getAdminToken());
  const [draft, setDraft] = useState<SocialDraft>(() => loadSavedDraft());
  const [preview, setPreview] = useState<SocialDraft>(() => loadSavedDraft());
  const [notice, setNotice] = useState("");

  const platformOptions: Platform[] = useMemo(
    () => ["Facebook", "Instagram", "Threads"],
    []
  );

  const updateDraft = <K extends keyof SocialDraft>(key: K, value: SocialDraft[K]) => {
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
    const draftForStorage = { ...draft, fileNames: [] };

    localStorage.setItem(socialDraftStorageKey, JSON.stringify(draftForStorage));
    setPreview(draft);
    setNotice("草稿已儲存。圖片與影片第一版只顯示檔名，尚未上傳。");
  };

  const updatePreview = () => {
    setPreview(draft);
    setNotice("預覽已更新。這只是測試預覽，尚未發文。");
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

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
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
              儲存草稿
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
    </main>
  );
}
