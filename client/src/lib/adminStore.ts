export type AdminNewsItem = {
  id: string;
  title: string;
  date: string;
  status: "draft" | "published";
  summary: string;
};

export type AdminMediaItem = {
  id: string;
  title: string;
  source: string;
  date: string;
  url: string;
  status: "draft" | "published";
};

export type AdminImageItem = {
  id: string;
  title: string;
  path: string;
  alt: string;
  category: string;
};

export type AdminInquiryItem = {
  id: string;
  name: string;
  contact: string;
  message: string;
  status: "new" | "replied" | "closed";
  createdAt: string;
  note: string;
};

export type AdminContent = {
  news: AdminNewsItem[];
  media: AdminMediaItem[];
  images: AdminImageItem[];
  mumbaoImages: AdminImageItem[];
  inquiries: AdminInquiryItem[];
};

export const ADMIN_SESSION_KEY = "mumbao_admin_session";
export const ADMIN_CONTENT_KEY = "mumbao_admin_content";
export const ADMIN_PASSWORD = "mumbao-admin";

export const defaultAdminContent: AdminContent = {
  news: [
    {
      id: "news-1",
      title: "慢寶宇宙正式登場",
      date: "2026-05-17",
      status: "published",
      summary: "慢慢蒔光的原創角色慢寶 MUMBAO，帶著雲朵與願望來到白雲基地。",
    },
  ],
  media: [
    {
      id: "media-1",
      title: "MUMBAO 慢寶宇宙品牌介紹",
      source: "品牌專題",
      date: "2026-05-17",
      url: "",
      status: "draft",
    },
  ],
  images: [
    {
      id: "image-hero",
      title: "首頁主視覺",
      path: "/images/mumbao/STime.JPG",
      alt: "慢慢蒔光主視覺",
      category: "首頁",
    },
  ],
  mumbaoImages: [
    {
      id: "mumbao-1",
      title: "認識慢寶 Hero",
      path: "/images/mumbao/1.jpg",
      alt: "認識慢寶 Hero",
      category: "Hero",
    },
    {
      id: "mumbao-2",
      title: "慢寶是誰",
      path: "/images/mumbao/2.jpg",
      alt: "慢寶是誰",
      category: "故事",
    },
    {
      id: "mumbao-3",
      title: "慢寶的象徵元素",
      path: "/images/mumbao/3.jpg",
      alt: "慢寶的象徵元素",
      category: "象徵",
    },
    {
      id: "mumbao-4",
      title: "覺醒模式",
      path: "/images/mumbao/4.jpg",
      alt: "覺醒模式",
      category: "狀態",
    },
    {
      id: "mumbao-5",
      title: "冥想模式",
      path: "/images/mumbao/5.jpg",
      alt: "冥想模式",
      category: "狀態",
    },
  ],
  inquiries: [
    {
      id: "inquiry-1",
      name: "示範旅人",
      contact: "guest@example.com",
      message: "想詢問包棟入住與慢寶相關體驗。",
      status: "new",
      createdAt: "2026-05-17",
      note: "",
    },
  ],
};

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readAdminContent(): AdminContent {
  if (typeof window === "undefined") return defaultAdminContent;

  const saved = window.localStorage.getItem(ADMIN_CONTENT_KEY);
  if (!saved) return defaultAdminContent;

  try {
    return {
      ...defaultAdminContent,
      ...JSON.parse(saved),
    };
  } catch {
    return defaultAdminContent;
  }
}

export function writeAdminContent(content: AdminContent) {
  window.localStorage.setItem(ADMIN_CONTENT_KEY, JSON.stringify(content));
}

export function isAdminLoggedIn() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ADMIN_SESSION_KEY) === "active";
}

export function setAdminLoggedIn(active: boolean) {
  if (active) {
    window.localStorage.setItem(ADMIN_SESSION_KEY, "active");
  } else {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }
}

export function getImagePath(
  image: Pick<AdminImageItem, "path"> | undefined,
  fallback: string
) {
  const path = image?.path?.trim();
  return path || fallback;
}

export function getHomeHeroImage(content = readAdminContent()) {
  const image =
    content.images.find((item) => item.id === "image-hero") ||
    content.images.find((item) => item.title.includes("首頁主視覺")) ||
    content.images.find((item) => item.category.includes("首頁"));

  return {
    src: getImagePath(image, "/images/mumbao/STime.JPG"),
    alt: image?.alt?.trim() || "慢慢蒔光主視覺",
  };
}

export function getMumbaoImage(index: number, content = readAdminContent()) {
  const fallback = `/images/mumbao/${index}.jpg`;
  const image =
    content.mumbaoImages[index - 1] ||
    content.mumbaoImages.find((item) => item.id === `mumbao-${index}`);

  return {
    src: getImagePath(image, fallback),
    alt: image?.alt?.trim() || `慢寶圖片 ${index}`,
  };
}
