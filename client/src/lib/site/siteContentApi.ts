export type SiteSection = {
  id?: string;
  section_key: string;
  section_type?: string;
  title?: string;
  subtitle?: string;
  content?: Record<string, unknown>;
  sort_order?: number;
  updated_at?: string | null;
};

export type SitePage = {
  id?: string;
  slug: string;
  title?: string;
  page_type?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image_url?: string | null;
  status?: string;
  updated_at?: string | null;
};

export type PublicSiteContent = {
  ok?: boolean;
  page: SitePage | null;
  sections: Record<string, SiteSection>;
};

function isCmsOverrideEnabled(section: SiteSection) {
  return section.content?.enable_cms_override === true;
}

function filterFrontendSections(sections: unknown) {
  if (!sections || typeof sections !== "object") return {};
  return Object.fromEntries(
    Object.entries(sections as Record<string, SiteSection>).filter(([, section]) => isCmsOverrideEnabled(section)),
  );
}

async function fetchSiteContent(url: string): Promise<PublicSiteContent> {
  const response = await fetch(url, { method: "GET" });
  const data = (await response.json().catch(() => ({}))) as Partial<PublicSiteContent>;
  if (!response.ok) {
    return { page: null, sections: {} };
  }
  return {
    ok: Boolean(data.ok),
    page: data.page || null,
    sections: filterFrontendSections(data.sections),
  };
}

export function fetchSiteGlobalContent() {
  return fetchSiteContent("/api/site-content?action=global");
}

export function fetchSitePageContent(slug: string) {
  return fetchSiteContent(`/api/site-content?action=page&slug=${encodeURIComponent(slug)}`);
}

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
