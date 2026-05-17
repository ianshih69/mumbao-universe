import { FormEvent, useMemo, useState } from "react";
import {
  Image,
  Inbox,
  LayoutDashboard,
  LogOut,
  Newspaper,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_PASSWORD,
  createId,
  defaultAdminContent,
  isAdminLoggedIn,
  readAdminContent,
  setAdminLoggedIn,
  type AdminContent,
} from "@/lib/adminStore";
import { writeAdminContent } from "@/lib/adminStore";

type AdminTab = "news" | "media" | "images" | "mumbaoImages" | "inquiries";

const tabs: Array<{
  id: AdminTab;
  label: string;
  icon: typeof Newspaper;
}> = [
  { id: "news", label: "最新消息", icon: Newspaper },
  { id: "media", label: "媒體報導", icon: LayoutDashboard },
  { id: "images", label: "圖片管理", icon: Image },
  { id: "mumbaoImages", label: "慢寶 5 張圖", icon: Upload },
  { id: "inquiries", label: "客服諮詢", icon: Inbox },
];

const statusLabels: Record<string, string> = {
  draft: "草稿",
  published: "已發布",
  new: "新留言",
  replied: "已回覆",
  closed: "已結案",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm text-stone-600">
      <span className="block font-medium text-stone-900">{label}</span>
      {children}
    </label>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-stone-300 bg-white/60 px-5 py-8 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(isAdminLoggedIn);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("news");
  const [content, setContent] = useState<AdminContent>(() => readAdminContent());
  const [savedAt, setSavedAt] = useState("");

  const counts = useMemo(
    () => ({
      news: content.news.length,
      media: content.media.length,
      images: content.images.length,
      mumbaoImages: content.mumbaoImages.length,
      inquiries: content.inquiries.length,
    }),
    [content]
  );

  const saveContent = (nextContent = content) => {
    writeAdminContent(nextContent);
    setContent(nextContent);
    setSavedAt(new Date().toLocaleString("zh-TW"));
  };

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();

    if (password !== ADMIN_PASSWORD) {
      setLoginError("密碼不正確，請重新輸入。");
      return;
    }

    setAdminLoggedIn(true);
    setLoggedIn(true);
    setLoginError("");
  };

  const logout = () => {
    setAdminLoggedIn(false);
    setLoggedIn(false);
    setPassword("");
  };

  const updateListItem = <T extends keyof AdminContent>(
    key: T,
    id: string,
    patch: Partial<AdminContent[T][number]>
  ) => {
    setContent((current) => ({
      ...current,
      [key]: current[key].map((item) =>
        "id" in item && item.id === id ? { ...item, ...patch } : item
      ),
    }));
  };

  const deleteListItem = <T extends keyof AdminContent>(key: T, id: string) => {
    setContent((current) => ({
      ...current,
      [key]: current[key].filter((item) => "id" in item && item.id !== id),
    }));
  };

  if (!loggedIn) {
    return (
      <main className="min-h-[100svh] bg-[#F7F4EF] px-5 py-10 text-stone-900">
        <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-md items-center">
          <form
            onSubmit={handleLogin}
            className="w-full space-y-7 border border-stone-200 bg-white p-7 shadow-xl shadow-stone-200/70"
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-400">
                MUMBAO Admin
              </p>
              <h1 className="font-serif text-3xl font-light tracking-wide">
                後台登入
              </h1>
              <p className="text-sm leading-7 text-stone-500">
                網頁版 Admin Dashboard，可使用電腦、平板與手機瀏覽器登入管理。
              </p>
            </div>

            <Field label="管理密碼">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="請輸入管理密碼"
                className="h-11 rounded-none"
              />
            </Field>

            {loginError && <p className="text-sm text-red-600">{loginError}</p>}

            <Button type="submit" className="h-11 w-full rounded-none">
              登入後台
            </Button>

            <p className="text-xs leading-6 text-stone-400">
              第一階段預設密碼：mumbao-admin。正式上線前請改為後端驗證與環境變數密碼。
            </p>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#F7F4EF] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-5 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-stone-400">
              MUMBAO Admin Dashboard
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              網站內容管理
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="rounded-none bg-white"
              onClick={() => saveContent()}
            >
              <Save className="h-4 w-4" />
              儲存變更
            </Button>
            <Button variant="ghost" className="rounded-none" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 md:grid-cols-[240px_1fr] md:px-8 md:py-8">
        <aside className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-between border px-4 py-3 text-left text-sm transition-colors ${
                    isActive
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </span>
                  <span className="text-xs opacity-70">{counts[tab.id]}</span>
                </button>
              );
            })}
          </div>

          <div className="border border-stone-200 bg-white p-4 text-xs leading-6 text-stone-500">
            {savedAt ? `最近儲存：${savedAt}` : "尚未儲存本次變更"}
          </div>
        </aside>

        <section className="space-y-6">
          {activeTab === "news" && (
            <ContentPanel
              title="最新消息管理"
              description="新增、編輯與切換最新消息發布狀態。"
              actionLabel="新增消息"
              onAdd={() =>
                setContent((current) => ({
                  ...current,
                  news: [
                    {
                      id: createId("news"),
                      title: "未命名消息",
                      date: new Date().toISOString().slice(0, 10),
                      status: "draft",
                      summary: "",
                    },
                    ...current.news,
                  ],
                }))
              }
            >
              {content.news.length === 0 ? (
                <EmptyHint text="目前沒有最新消息。" />
              ) : (
                content.news.map((item) => (
                  <EditableCard
                    key={item.id}
                    title={item.title}
                    badge={statusLabels[item.status]}
                    onDelete={() => deleteListItem("news", item.id)}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="標題">
                        <Input
                          value={item.title}
                          onChange={(event) =>
                            updateListItem("news", item.id, { title: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="日期">
                        <Input
                          type="date"
                          value={item.date}
                          onChange={(event) =>
                            updateListItem("news", item.id, { date: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="狀態">
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateListItem("news", item.id, {
                              status: event.target.value as "draft" | "published",
                            })
                          }
                          className="h-9 w-full border border-stone-200 bg-white px-3 text-sm"
                        >
                          <option value="draft">草稿</option>
                          <option value="published">已發布</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="摘要">
                      <Textarea
                        value={item.summary}
                        onChange={(event) =>
                          updateListItem("news", item.id, { summary: event.target.value })
                        }
                        className="min-h-28 rounded-none"
                      />
                    </Field>
                  </EditableCard>
                ))
              )}
            </ContentPanel>
          )}

          {activeTab === "media" && (
            <ContentPanel
              title="媒體報導管理"
              description="整理媒體標題、來源、日期與外部連結。"
              actionLabel="新增報導"
              onAdd={() =>
                setContent((current) => ({
                  ...current,
                  media: [
                    {
                      id: createId("media"),
                      title: "未命名報導",
                      source: "",
                      date: new Date().toISOString().slice(0, 10),
                      url: "",
                      status: "draft",
                    },
                    ...current.media,
                  ],
                }))
              }
            >
              {content.media.length === 0 ? (
                <EmptyHint text="目前沒有媒體報導。" />
              ) : (
                content.media.map((item) => (
                  <EditableCard
                    key={item.id}
                    title={item.title}
                    badge={statusLabels[item.status]}
                    onDelete={() => deleteListItem("media", item.id)}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="標題">
                        <Input
                          value={item.title}
                          onChange={(event) =>
                            updateListItem("media", item.id, { title: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="來源">
                        <Input
                          value={item.source}
                          onChange={(event) =>
                            updateListItem("media", item.id, { source: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="日期">
                        <Input
                          type="date"
                          value={item.date}
                          onChange={(event) =>
                            updateListItem("media", item.id, { date: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="狀態">
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateListItem("media", item.id, {
                              status: event.target.value as "draft" | "published",
                            })
                          }
                          className="h-9 w-full border border-stone-200 bg-white px-3 text-sm"
                        >
                          <option value="draft">草稿</option>
                          <option value="published">已發布</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="連結">
                      <Input
                        value={item.url}
                        onChange={(event) =>
                          updateListItem("media", item.id, { url: event.target.value })
                        }
                        placeholder="https://"
                        className="rounded-none"
                      />
                    </Field>
                  </EditableCard>
                ))
              )}
            </ContentPanel>
          )}

          {activeTab === "images" && (
            <ImageManager
              title="圖片管理"
              description="管理網站共用圖片路徑、分類與替代文字。"
              items={content.images}
              onAdd={() =>
                setContent((current) => ({
                  ...current,
                  images: [
                    {
                      id: createId("image"),
                      title: "未命名圖片",
                      path: "/images/",
                      alt: "",
                      category: "共用",
                    },
                    ...current.images,
                  ],
                }))
              }
              onUpdate={(id, patch) => updateListItem("images", id, patch)}
              onDelete={(id) => deleteListItem("images", id)}
            />
          )}

          {activeTab === "mumbaoImages" && (
            <ImageManager
              title="認識慢寶 5 張圖管理"
              description="管理認識慢寶頁面使用的五張圖片路徑與說明。"
              items={content.mumbaoImages}
              lockedCount
              onAdd={() => undefined}
              onUpdate={(id, patch) => updateListItem("mumbaoImages", id, patch)}
              onDelete={(id) => deleteListItem("mumbaoImages", id)}
            />
          )}

          {activeTab === "inquiries" && (
            <ContentPanel
              title="客服諮詢留言管理"
              description="追蹤旅人的諮詢內容、處理狀態與內部備註。"
              actionLabel="新增留言"
              onAdd={() =>
                setContent((current) => ({
                  ...current,
                  inquiries: [
                    {
                      id: createId("inquiry"),
                      name: "未命名旅人",
                      contact: "",
                      message: "",
                      status: "new",
                      createdAt: new Date().toISOString().slice(0, 10),
                      note: "",
                    },
                    ...current.inquiries,
                  ],
                }))
              }
            >
              {content.inquiries.length === 0 ? (
                <EmptyHint text="目前沒有客服諮詢留言。" />
              ) : (
                content.inquiries.map((item) => (
                  <EditableCard
                    key={item.id}
                    title={item.name}
                    badge={statusLabels[item.status]}
                    onDelete={() => deleteListItem("inquiries", item.id)}
                  >
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="姓名">
                        <Input
                          value={item.name}
                          onChange={(event) =>
                            updateListItem("inquiries", item.id, { name: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="聯絡方式">
                        <Input
                          value={item.contact}
                          onChange={(event) =>
                            updateListItem("inquiries", item.id, { contact: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="日期">
                        <Input
                          type="date"
                          value={item.createdAt}
                          onChange={(event) =>
                            updateListItem("inquiries", item.id, { createdAt: event.target.value })
                          }
                          className="rounded-none"
                        />
                      </Field>
                      <Field label="狀態">
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateListItem("inquiries", item.id, {
                              status: event.target.value as "new" | "replied" | "closed",
                            })
                          }
                          className="h-9 w-full border border-stone-200 bg-white px-3 text-sm"
                        >
                          <option value="new">新留言</option>
                          <option value="replied">已回覆</option>
                          <option value="closed">已結案</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="留言內容">
                      <Textarea
                        value={item.message}
                        onChange={(event) =>
                          updateListItem("inquiries", item.id, { message: event.target.value })
                        }
                        className="min-h-28 rounded-none"
                      />
                    </Field>
                    <Field label="內部備註">
                      <Textarea
                        value={item.note}
                        onChange={(event) =>
                          updateListItem("inquiries", item.id, { note: event.target.value })
                        }
                        className="min-h-24 rounded-none"
                      />
                    </Field>
                  </EditableCard>
                ))
              )}
            </ContentPanel>
          )}

          <div className="flex flex-wrap gap-3">
            <Button className="rounded-none" onClick={() => saveContent()}>
              <Save className="h-4 w-4" />
              儲存全部變更
            </Button>
            <Button
              variant="outline"
              className="rounded-none bg-white"
              onClick={() => saveContent(defaultAdminContent)}
            >
              還原預設資料
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ContentPanel({
  title,
  description,
  actionLabel,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border border-stone-200 bg-white p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-light tracking-wide">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
        </div>
        <Button className="rounded-none" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function EditableCard({
  title,
  badge,
  onDelete,
  children,
}: {
  title: string;
  badge: string;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="space-y-5 border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-medium">{title}</h3>
          <Badge variant="outline">{badge}</Badge>
        </div>
        <Button variant="ghost" className="rounded-none text-red-600" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          刪除
        </Button>
      </div>
      {children}
    </article>
  );
}

function ImageManager({
  title,
  description,
  items,
  lockedCount,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  description: string;
  items: AdminContent["images"];
  lockedCount?: boolean;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<AdminContent["images"][number]>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ContentPanel
      title={title}
      description={description}
      actionLabel={lockedCount ? "固定 5 張" : "新增圖片"}
      onAdd={onAdd}
    >
      {items.length === 0 ? (
        <EmptyHint text="目前沒有圖片資料。" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <EditableCard
              key={item.id}
              title={item.title}
              badge={item.category}
              onDelete={() => onDelete(item.id)}
            >
              <div className="overflow-hidden border border-stone-200 bg-[#F7F4EF]">
                <img
                  src={item.path}
                  alt={item.alt}
                  className="h-56 w-full object-contain"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="名稱">
                  <Input
                    value={item.title}
                    onChange={(event) => onUpdate(item.id, { title: event.target.value })}
                    className="rounded-none"
                  />
                </Field>
                <Field label="分類">
                  <Input
                    value={item.category}
                    onChange={(event) => onUpdate(item.id, { category: event.target.value })}
                    className="rounded-none"
                  />
                </Field>
              </div>
              <Field label="圖片路徑">
                <Input
                  value={item.path}
                  onChange={(event) => onUpdate(item.id, { path: event.target.value })}
                  className="rounded-none"
                />
              </Field>
              <Field label="替代文字">
                <Input
                  value={item.alt}
                  onChange={(event) => onUpdate(item.id, { alt: event.target.value })}
                  className="rounded-none"
                />
              </Field>
            </EditableCard>
          ))}
        </div>
      )}
    </ContentPanel>
  );
}
