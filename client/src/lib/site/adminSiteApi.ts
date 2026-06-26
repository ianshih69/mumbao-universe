import { adminAuthExpiredMessage } from "@/lib/shop/adminAuth";

export type CmsPage = {
  id: string;
  slug: string;
  title: string;
  page_type?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image_url?: string | null;
  status: "draft" | "published" | "archived";
  created_at?: string | null;
  updated_at?: string | null;
};

export type CmsSection = {
  id: string;
  page_id: string;
  section_key: string;
  section_type: string;
  title?: string | null;
  subtitle?: string | null;
  content_json: Record<string, unknown>;
  sort_order: number;
  is_visible: boolean;
  status: "draft" | "published" | "archived";
  created_at?: string | null;
  updated_at?: string | null;
};

export type CmsMedia = {
  id: string;
  file_name?: string | null;
  original_name?: string | null;
  url: string;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
  mime_type?: string | null;
  alt_text?: string | null;
  caption?: string | null;
  category?: string | null;
  usage_hint?: string | null;
  status: "published" | "archived";
  created_at?: string | null;
  updated_at?: string | null;
};

export type CmsRevision = {
  id: string;
  target_type: string;
  target_id: string;
  before_json?: unknown;
  after_json?: unknown;
  action?: string | null;
  edited_by?: string | null;
  created_at: string;
};

export class AdminSiteApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AdminSiteApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function requestAdminSite<T>(token: string, url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await parseJson(response)) as T & { error?: string; code?: string };
  if (!response.ok) {
    if (response.status === 401) throw new AdminSiteApiError(adminAuthExpiredMessage, response.status, data.code);
    throw new AdminSiteApiError(data.error || `Request failed: ${response.status}`, response.status, data.code);
  }
  return data;
}

export function fetchCmsPages(token: string) {
  return requestAdminSite<{ pages: CmsPage[] }>(token, "/api/admin-site?action=pages");
}

export function fetchCmsPageDetail(token: string, slug: string) {
  return requestAdminSite<{ page: CmsPage; sections: CmsSection[] }>(
    token,
    `/api/admin-site?action=page-detail&slug=${encodeURIComponent(slug)}`,
  );
}

export function updateCmsPage(
  token: string,
  payload: Partial<Pick<CmsPage, "id" | "slug" | "title" | "seo_title" | "seo_description" | "og_image_url" | "status">>,
) {
  return requestAdminSite<{ page: CmsPage }>(token, "/api/admin-site?action=update-page", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateCmsSection(
  token: string,
  payload: {
    id: string;
    title?: string | null;
    subtitle?: string | null;
    content_json?: Record<string, unknown>;
    is_visible?: boolean;
    status?: "draft" | "published" | "archived";
    sort_order?: number;
  },
) {
  return requestAdminSite<{ section: CmsSection }>(token, "/api/admin-site?action=update-section", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchCmsMedia(token: string) {
  return requestAdminSite<{ media: CmsMedia[] }>(token, "/api/admin-site?action=media-list");
}

export function createCmsMedia(
  token: string,
  payload: {
    url: string;
    original_name?: string;
    alt_text?: string;
    caption?: string;
    category?: string;
    usage_hint?: string;
  },
) {
  return requestAdminSite<{ media: CmsMedia }>(token, "/api/admin-site?action=media-create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCmsMedia(token: string, payload: Partial<CmsMedia> & { id: string }) {
  return requestAdminSite<{ media: CmsMedia }>(token, "/api/admin-site?action=media-update", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function archiveCmsMedia(token: string, id: string) {
  return requestAdminSite<{ media: CmsMedia }>(token, "/api/admin-site?action=media-delete", {
    method: "PATCH",
    body: JSON.stringify({ id }),
  });
}

export function fetchCmsRevisions(token: string, targetType?: string, targetId?: string) {
  const params = new URLSearchParams({ action: "revisions" });
  if (targetType && targetId) {
    params.set("targetType", targetType);
    params.set("targetId", targetId);
  }
  return requestAdminSite<{ revisions: CmsRevision[] }>(token, `/api/admin-site?${params.toString()}`);
}
