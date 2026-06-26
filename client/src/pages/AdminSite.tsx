import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ExternalLink,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Save,
  Settings,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import AdminShopHeaderLinks from "@/components/shop/AdminShopHeaderLinks";
import { clearAdminToken, getAdminToken, isAdminAuthError } from "@/lib/shop/adminAuth";
import {
  createCmsMedia,
  fetchCmsMedia,
  fetchCmsPageDetail,
  fetchCmsPages,
  fetchCmsRevisions,
  updateCmsPage,
  updateCmsSection,
  type CmsMedia,
  type CmsPage,
  type CmsRevision,
  type CmsSection,
} from "@/lib/site/adminSiteApi";
import { cn } from "@/lib/utils";

type ViewKey = string;
type JsonRecord = Record<string, unknown>;

const editablePageSlugs = new Set(["global", "home", "booking", "rooms", "shop"]);

const pageLabels: Record<string, string> = {
  global: "全站設定",
  home: "首頁",
  about: "關於我們",
  news: "最新消息",
  mumbao: "認識慢寶",
  rooms: "房型介紹",
  booking: "線上訂房頁",
  shop: "宇宙碎品頁",
  press: "媒體報導",
};

const mediaCategories = ["hero", "room", "booking", "mumbao", "shop", "press", "logo", "other"];

function emptySection(sectionKey: string): CmsSection | null {
  return sectionKey
    ? ({
        id: "",
        page_id: "",
        section_key: sectionKey,
        section_type: "placeholder",
        title: "",
        subtitle: "",
        content_json: {},
        sort_order: 0,
        is_visible: true,
        status: "published",
      } as CmsSection)
    : null;
}

function sectionContent(section: CmsSection | null): JsonRecord {
  return section?.content_json && typeof section.content_json === "object"
    ? section.content_json
    : {};
}

function getText(content: JsonRecord, key: string, fallback = "") {
  const value = content[key];
  return typeof value === "string" ? value : fallback;
}

function getBool(content: JsonRecord, key: string, fallback = false) {
  const value = content[key];
  return typeof value === "boolean" ? value : fallback;
}

function getList<T = unknown>(content: JsonRecord, key: string) {
  const value = content[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fieldClassName() {
  return "h-11 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-28 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function SectionCard({
  section,
  token,
  onSaved,
}: {
  section: CmsSection;
  token: string;
  onSaved: (section: CmsSection) => void;
}) {
  const [title, setTitle] = useState(section.title || "");
  const [subtitle, setSubtitle] = useState(section.subtitle || "");
  const [content, setContent] = useState<JsonRecord>(() => sectionContent(section));
  const [isVisible, setIsVisible] = useState(section.is_visible);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(section.title || "");
    setSubtitle(section.subtitle || "");
    setContent(sectionContent(section));
    setIsVisible(section.is_visible);
    setMessage("");
    setError("");
  }, [section]);

  function updateContent(key: string, value: unknown) {
    setContent((current) => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!section.id) return;
    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await updateCmsSection(token, {
        id: section.id,
        title,
        subtitle,
        content_json: content,
        is_visible: isVisible,
        status: "published",
      });
      onSaved(result.section);
      setMessage("已儲存並發布。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存失敗，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  }

  function renderEditor() {
    if (section.section_key === "global.top_banner") {
      return (
        <>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            公告文字
            <input
              className={fieldClassName()}
              value={getText(content, "text")}
              onChange={(event) => updateContent("text", event.target.value)}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={getBool(content, "is_visible", true)}
              onChange={(event) => updateContent("is_visible", event.target.checked)}
            />
            顯示上方公告
          </label>
        </>
      );
    }

    if (section.section_key === "global.navigation") {
      const items = getList<JsonRecord>(content, "items");
      const updateItem = (index: number, key: string, value: unknown) => {
        const next = [...items];
        next[index] = { ...(next[index] || {}), [key]: value };
        updateContent("items", next);
      };
      const addItem = () => {
        updateContent("items", [
          ...items,
          { label: "新選單", href: "/", internal: true, is_visible: true, sort_order: (items.length + 1) * 10 },
        ]);
      };

      return (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-[8px] border border-[#eadfce] bg-white/75 p-3 md:grid-cols-[1fr_1.3fr_auto]">
              <input
                className={fieldClassName()}
                value={String(item.label || "")}
                onChange={(event) => updateItem(index, "label", event.target.value)}
                placeholder="選單文字"
              />
              <input
                className={fieldClassName()}
                value={String(item.href || "")}
                onChange={(event) => updateItem(index, "href", event.target.value)}
                placeholder="/booking"
              />
              <label className="inline-flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={item.is_visible !== false}
                  onChange={(event) => updateItem(index, "is_visible", event.target.checked)}
                />
                顯示
              </label>
            </div>
          ))}
          <Button type="button" variant="outline" className="rounded-full border-[#eadfce]" onClick={addItem}>
            新增選單項目
          </Button>
        </div>
      );
    }

    if (["home.hero", "booking.hero", "rooms.hero", "shop.hero"].includes(section.section_key)) {
      return (
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            Eyebrow / 小標
            <input className={fieldClassName()} value={getText(content, "eyebrow")} onChange={(event) => updateContent("eyebrow", event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            標題
            <textarea className={textareaClassName()} value={getText(content, "title")} onChange={(event) => updateContent("title", event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            副標
            <textarea className={textareaClassName()} value={getText(content, "subtitle")} onChange={(event) => updateContent("subtitle", event.target.value)} />
          </label>
          {section.section_key === "home.hero" && (
            <>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                內文
                <textarea className={textareaClassName()} value={getText(content, "body")} onChange={(event) => updateContent("body", event.target.value)} />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  按鈕文字
                  <input className={fieldClassName()} value={getText(content, "button_text")} onChange={(event) => updateContent("button_text", event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  按鈕連結
                  <input className={fieldClassName()} value={getText(content, "button_href")} onChange={(event) => updateContent("button_href", event.target.value)} />
                </label>
              </div>
              <ImageUrlFields content={content} updateContent={updateContent} />
            </>
          )}
        </div>
      );
    }

    if (section.section_key === "booking.instructions") {
      const items = getList<string>(content, "items");
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <label key={index} className="grid gap-1.5 text-sm font-medium text-stone-700">
              說明 {index + 1}
              <input
                className={fieldClassName()}
                value={items[index] || ""}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = event.target.value;
                  updateContent("items", next);
                }}
              />
            </label>
          ))}
        </div>
      );
    }

    if (["booking.pet_note", "booking.success_message", "rooms.villa_intro", "home.booking_cta"].includes(section.section_key)) {
      return (
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            文字
            <textarea className={textareaClassName()} value={getText(content, "text", getText(content, "title"))} onChange={(event) => updateContent("text", event.target.value)} />
          </label>
          {section.section_key === "home.booking_cta" && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                按鈕文字
                <input className={fieldClassName()} value={getText(content, "button_text")} onChange={(event) => updateContent("button_text", event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                按鈕連結
                <input className={fieldClassName()} value={getText(content, "button_href")} onChange={(event) => updateContent("button_href", event.target.value)} />
              </label>
            </div>
          )}
        </div>
      );
    }

    if (section.section_key === "rooms.room_list") {
      const rooms = getList<JsonRecord>(content, "rooms").slice(0, 5);
      const updateRoom = (index: number, key: string, value: string) => {
        const next = [...rooms];
        next[index] = { ...(next[index] || {}), [key]: value };
        updateContent("rooms", next.slice(0, 5));
      };
      return (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => {
            const room = rooms[index] || {};
            return (
              <div key={index} className="rounded-[12px] border border-[#eadfce] bg-white/75 p-4">
                <p className="mb-3 text-sm font-semibold text-stone-900">第 {index + 1} 間房</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className={fieldClassName()} value={String(room.name || "")} onChange={(event) => updateRoom(index, "name", event.target.value)} placeholder="英文識別 / 名稱" />
                  <input className={fieldClassName()} value={String(room.title || "")} onChange={(event) => updateRoom(index, "title", event.target.value)} placeholder="前台標題" />
                  <input className={fieldClassName()} value={String(room.image_url || "")} onChange={(event) => updateRoom(index, "image_url", event.target.value)} placeholder="圖片 URL" />
                  <input className={fieldClassName()} value={String(room.alt_text || "")} onChange={(event) => updateRoom(index, "alt_text", event.target.value)} placeholder="圖片 alt" />
                  <textarea className={`${textareaClassName()} md:col-span-2`} value={String(room.description || "")} onChange={(event) => updateRoom(index, "description", event.target.value)} placeholder="描述" />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="rounded-[8px] border border-dashed border-[#d7c6b5] bg-white/70 p-4 text-sm leading-6 text-stone-500">
        此區塊第一版尚未開放結構化編輯。資料已保留，之後可再加入專屬表單。
      </div>
    );
  }

  return (
    <form className="rounded-[12px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm" onSubmit={handleSave}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#9f7868]">{section.section_key}</p>
          <h3 className="mt-1 font-serif text-2xl text-stone-900">{section.title || section.section_key}</h3>
          <p className="mt-1 text-xs text-stone-500">更新時間：{formatDateTime(section.updated_at)}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={isVisible} onChange={(event) => setIsVisible(event.target.checked)} />
          前台顯示
        </label>
      </div>

      <div className="mt-5 grid gap-4">
        {renderEditor()}
      </div>

      {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex flex-col gap-3 border-t border-[#eadfce] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-stone-500">第一版採「儲存並發布」，資料會寫入版本紀錄。</p>
        <Button type="submit" disabled={isSaving || !section.id} className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          儲存並發布
        </Button>
      </div>
    </form>
  );
}

function ImageUrlFields({
  content,
  updateContent,
}: {
  content: JsonRecord;
  updateContent: (key: string, value: unknown) => void;
}) {
  const imageUrl = getText(content, "desktop_image_url");
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          桌機圖片 URL
          <input className={fieldClassName()} value={imageUrl} onChange={(event) => updateContent("desktop_image_url", event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          手機圖片 URL
          <input className={fieldClassName()} value={getText(content, "mobile_image_url")} onChange={(event) => updateContent("mobile_image_url", event.target.value)} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-stone-700">
        圖片 alt
        <input className={fieldClassName()} value={getText(content, "alt_text")} onChange={(event) => updateContent("alt_text", event.target.value)} />
      </label>
      {imageUrl && (
        <div className="overflow-hidden rounded-[12px] border border-[#eadfce] bg-white">
          <img src={imageUrl} alt={getText(content, "alt_text", "區塊預覽")} className="h-40 w-full object-cover" />
        </div>
      )}
    </div>
  );
}

function PageSettingsForm({
  page,
  token,
  onSaved,
}: {
  page: CmsPage;
  token: string;
  onSaved: (page: CmsPage) => void;
}) {
  const [title, setTitle] = useState(page.title || "");
  const [seoTitle, setSeoTitle] = useState(page.seo_title || "");
  const [seoDescription, setSeoDescription] = useState(page.seo_description || "");
  const [ogImageUrl, setOgImageUrl] = useState(page.og_image_url || "");
  const [status, setStatus] = useState<CmsPage["status"]>(page.status || "published");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(page.title || "");
    setSeoTitle(page.seo_title || "");
    setSeoDescription(page.seo_description || "");
    setOgImageUrl(page.og_image_url || "");
    setStatus(page.status || "published");
    setMessage("");
    setError("");
  }, [page]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await updateCmsPage(token, {
        id: page.id,
        title,
        seo_title: seoTitle,
        seo_description: seoDescription,
        og_image_url: ogImageUrl,
        status,
      });
      onSaved(result.page);
      setMessage("頁面設定已更新。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "頁面設定儲存失敗。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="rounded-[12px] border border-[#eadfce] bg-white p-5 shadow-sm" onSubmit={handleSave}>
      <div className="mb-4 flex items-center gap-2">
        <Settings className="h-4 w-4 text-[#8b6f5b]" />
        <h3 className="font-serif text-xl text-stone-900">頁面設定</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          後台頁面名稱
          <input className={fieldClassName()} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          狀態
          <select className={fieldClassName()} value={status} onChange={(event) => setStatus(event.target.value as CmsPage["status"])}>
            <option value="published">published</option>
            <option value="draft">draft</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-stone-700 md:col-span-2">
          SEO 標題
          <input className={fieldClassName()} value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-stone-700 md:col-span-2">
          SEO 描述
          <textarea className={textareaClassName()} value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-stone-700 md:col-span-2">
          OG 圖片 URL
          <input className={fieldClassName()} value={ogImageUrl} onChange={(event) => setOgImageUrl(event.target.value)} />
        </label>
      </div>
      {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={isSaving} className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          儲存頁面設定
        </Button>
      </div>
    </form>
  );
}

function MediaLibrary({ token }: { token: string }) {
  const [media, setMedia] = useState<CmsMedia[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    url: "",
    original_name: "",
    alt_text: "",
    caption: "",
    category: "hero",
    usage_hint: "",
  });

  const loadMedia = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await fetchCmsMedia(token);
      setMedia(result.media || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "圖片素材讀取失敗。");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await createCmsMedia(token, form);
      setMedia((current) => [result.media, ...current].filter(Boolean));
      setForm({ url: "", original_name: "", alt_text: "", caption: "", category: "hero", usage_hint: "" });
      setMessage("圖片素材已加入。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "圖片素材新增失敗。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-[12px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <ImageIcon className="mt-1 h-5 w-5 text-[#8b6f5b]" />
          <div>
            <h2 className="font-serif text-2xl text-stone-900">圖片素材庫</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              第一版使用公開圖片 URL 與 metadata 管理；R2 上傳可在下一階段接入安全的 server-side presigned flow。
            </p>
          </div>
        </div>
        <form className="grid gap-4" onSubmit={handleCreate}>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            圖片 URL
            <input className={fieldClassName()} value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              素材名稱
              <input className={fieldClassName()} value={form.original_name} onChange={(event) => setForm((current) => ({ ...current, original_name: event.target.value }))} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              分類
              <select className={fieldClassName()} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                {mediaCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            Alt 文字
            <input className={fieldClassName()} value={form.alt_text} onChange={(event) => setForm((current) => ({ ...current, alt_text: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            說明 / 使用建議
            <textarea className={textareaClassName()} value={form.caption} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} />
          </label>
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving} className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              新增圖片素材
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-[12px] border border-[#eadfce] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-serif text-xl text-stone-900">素材列表</h3>
          <Button type="button" variant="outline" className="rounded-full border-[#eadfce]" onClick={() => void loadMedia()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            重新整理
          </Button>
        </div>
        {media.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[#d7c6b5] bg-[#fffdf8] p-5 text-center text-sm text-stone-500">
            目前沒有圖片素材。
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {media.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-[12px] border border-[#eadfce] bg-[#fffdf8]">
                <img src={item.thumbnail_url || item.url} alt={item.alt_text || item.original_name || "圖片素材"} className="h-36 w-full object-cover" />
                <div className="space-y-2 p-4">
                  <p className="truncate text-sm font-semibold text-stone-900">{item.original_name || item.file_name || item.url}</p>
                  <p className="text-xs text-stone-500">{item.category || "other"}・{item.status}</p>
                  <a className="inline-flex items-center gap-1 text-xs font-medium text-[#8b6f5b] hover:underline" href={item.url} target="_blank" rel="noreferrer">
                    開啟圖片 <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function AdminSite() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [selectedView, setSelectedView] = useState<ViewKey>("global");
  const [selectedPage, setSelectedPage] = useState<CmsPage | null>(null);
  const [sections, setSections] = useState<CmsSection[]>([]);
  const [revisions, setRevisions] = useState<CmsRevision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const currentToken = getAdminToken();
    setToken(currentToken);
    if (!currentToken) {
      setIsLoading(false);
    }
  }, []);

  const pageOptions = useMemo(() => {
    const sorted = [...pages].sort((a, b) => {
      const order = ["global", "home", "booking", "rooms", "shop", "about", "news", "mumbao", "press"];
      return order.indexOf(a.slug) - order.indexOf(b.slug);
    });
    return sorted;
  }, [pages]);

  const selectedSlug = selectedView === "media" ? "" : selectedView;
  const isEditablePage = selectedSlug ? editablePageSlugs.has(selectedSlug) : false;

  const loadAll = useCallback(
    async (nextView = selectedView, quiet = false) => {
      if (!token) return;
      if (!quiet) setIsLoading(true);
      setIsRefreshing(true);
      setError("");

      try {
        const pageResult = await fetchCmsPages(token);
        setPages(pageResult.pages || []);

        if (nextView !== "media") {
          const detail = await fetchCmsPageDetail(token, nextView);
          setSelectedPage(detail.page);
          setSections(detail.sections || []);
          const revisionResult = await fetchCmsRevisions(token);
          setRevisions(revisionResult.revisions || []);
        } else {
          setSelectedPage(null);
          setSections([]);
        }
      } catch (loadError) {
        if (isAdminAuthError(loadError)) {
          clearAdminToken();
          setLocation(`/admin/shop/login?redirect=${encodeURIComponent("/admin/site")}`);
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "官網內容管理讀取失敗。");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedView, setLocation, token],
  );

  useEffect(() => {
    if (token) void loadAll(selectedView);
  }, [loadAll, selectedView, token]);

  function updateSectionState(updated: CmsSection) {
    setSections((current) => current.map((section) => (section.id === updated.id ? updated : section)));
  }

  function updatePageState(updated: CmsPage) {
    setSelectedPage(updated);
    setPages((current) => current.map((page) => (page.id === updated.id ? updated : page)));
  }

  function getSection(sectionKey: string) {
    return sections.find((section) => section.section_key === sectionKey) || emptySection(sectionKey);
  }

  function renderPageContent() {
    if (selectedView === "media") {
      return token ? <MediaLibrary token={token} /> : null;
    }

    if (!selectedPage) {
      return null;
    }

    if (!isEditablePage) {
      return (
        <section className="rounded-[12px] border border-dashed border-[#d7c6b5] bg-[#fffdf8] p-8 text-center shadow-sm">
          <Archive className="mx-auto h-8 w-8 text-[#8b6f5b]" />
          <h2 className="mt-4 font-serif text-2xl text-stone-900">{selectedPage.title}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            此頁內容管理尚未開放。第一版先支援全站設定、首頁、線上訂房頁、房型介紹與圖片素材庫。
          </p>
        </section>
      );
    }

    const sectionKeysByPage: Record<string, string[]> = {
      global: ["global.top_banner", "global.navigation", "global.footer", "global.seo"],
      home: ["home.hero", "home.booking_cta"],
      booking: ["booking.hero", "booking.instructions", "booking.pet_note", "booking.success_message"],
      rooms: ["rooms.hero", "rooms.villa_intro", "rooms.room_list"],
      shop: ["shop.hero"],
    };
    const sectionKeys = sectionKeysByPage[selectedPage.slug] || [];

    return (
      <div className="grid gap-5">
        <PageSettingsForm page={selectedPage} token={token} onSaved={updatePageState} />
        {sectionKeys.map((key) => {
          const section = getSection(key);
          return section ? <SectionCard key={key} section={section} token={token} onSaved={updateSectionState} /> : null;
        })}

        <section className="rounded-[12px] border border-[#eadfce] bg-white p-5 shadow-sm">
          <h3 className="font-serif text-xl text-stone-900">最近修改紀錄</h3>
          {revisions.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">目前沒有修改紀錄。</p>
          ) : (
            <div className="mt-4 space-y-2">
              {revisions.slice(0, 5).map((revision) => (
                <div key={revision.id} className="rounded-[8px] bg-[#fbf7f1] px-3 py-2 text-xs text-stone-600">
                  {revision.action || "update"}・{revision.target_type}・{formatDateTime(revision.created_at)}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f3ed] text-stone-900">
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-6 lg:px-8">
        <header className="mb-6 rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-[#9f7868]">管理中心 / 官網內容管理</p>
              <h1 className="mt-2 font-serif text-3xl text-stone-900">官網內容管理</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
                用固定頁面與區塊管理官網文字、圖片與導覽，避免自由 HTML 破壞版面；前台資料不存在時會回到原本 fallback。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AdminShopHeaderLinks
                context="site"
                onRefresh={() => loadAll(selectedView, true)}
                isRefreshing={isRefreshing}
                showLogout
              />
            </div>
          </div>
        </header>

        {!token && (
          <section className="rounded-[12px] border border-[#eadfce] bg-white p-8 text-center shadow-sm">
            <h2 className="font-serif text-2xl text-stone-900">請先登入後台</h2>
            <p className="mt-2 text-sm text-stone-500">官網內容管理僅限 super_admin / admin 使用。</p>
            <Button asChild className="mt-5 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
              <Link href="/admin/shop/login?redirect=/admin/site">前往後台登入</Link>
            </Button>
          </section>
        )}

        {token && (
          <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="rounded-[16px] border border-[#eadfce] bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em] text-[#9f7868] lg:hidden">
                選擇頁面
                <select className={`${fieldClassName()} mt-2 w-full`} value={selectedView} onChange={(event) => setSelectedView(event.target.value)}>
                  {pageOptions.map((page) => (
                    <option key={page.slug} value={page.slug}>
                      {pageLabels[page.slug] || page.title}
                    </option>
                  ))}
                  <option value="media">圖片素材庫</option>
                </select>
              </label>

              <nav className="hidden gap-2 lg:grid">
                {pageOptions.map((page) => (
                  <button
                    key={page.slug}
                    type="button"
                    className={cn(
                      "flex items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-sm transition",
                      selectedView === page.slug ? "bg-[#8b6f5b] text-white" : "text-stone-600 hover:bg-[#f7f1e9]",
                    )}
                    onClick={() => setSelectedView(page.slug)}
                  >
                    <span>{pageLabels[page.slug] || page.title}</span>
                    {!editablePageSlugs.has(page.slug) && <span className="text-[10px] opacity-70">未開放</span>}
                  </button>
                ))}
                <button
                  type="button"
                  className={cn(
                    "mt-2 flex items-center gap-2 rounded-[10px] border border-[#eadfce] px-3 py-2.5 text-left text-sm transition",
                    selectedView === "media" ? "bg-[#8b6f5b] text-white" : "text-stone-600 hover:bg-[#f7f1e9]",
                  )}
                  onClick={() => setSelectedView("media")}
                >
                  <ImageIcon className="h-4 w-4" />
                  圖片素材庫
                </button>
              </nav>
            </aside>

            <section className="min-w-0">
              {isLoading ? (
                <div className="rounded-[12px] border border-[#eadfce] bg-white p-8 text-center shadow-sm">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#8b6f5b]" />
                  <p className="mt-3 text-sm text-stone-500">正在讀取官網內容...</p>
                </div>
              ) : error ? (
                <div className="rounded-[12px] border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm leading-6">{error}</p>
                    <Button type="button" variant="outline" onClick={() => void loadAll(selectedView)}>
                      <RefreshCw className="h-4 w-4" />
                      重新整理
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5">
                  <div className="rounded-[12px] border border-[#eadfce] bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          {selectedView === "media" ? <ImageIcon className="h-5 w-5 text-[#8b6f5b]" /> : <LayoutDashboard className="h-5 w-5 text-[#8b6f5b]" />}
                          <h2 className="font-serif text-2xl text-stone-900">
                            {selectedView === "media" ? "圖片素材庫" : selectedPage?.title || pageLabels[selectedView] || selectedView}
                          </h2>
                        </div>
                        <p className="mt-2 text-sm text-stone-500">
                          {selectedView === "media"
                            ? "管理可用於官網區塊的圖片 URL 與 alt metadata。"
                            : `Slug: ${selectedView}`}
                        </p>
                      </div>
                      {selectedView !== "media" && editablePageSlugs.has(selectedView) && (
                        <Button asChild variant="outline" className="rounded-full border-[#eadfce]">
                          <a
                            href={selectedView === "home" ? "/" : selectedView === "booking" ? "/booking" : selectedView === "rooms" ? "/#rooms" : "/shop"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                            前台預覽
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  {renderPageContent()}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
