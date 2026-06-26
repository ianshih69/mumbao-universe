import {
  firstQueryValue,
  sendJson,
  supabaseRequest,
} from "../server/shopShared.js";

const PAGE_SELECT = "id,slug,title,page_type,seo_title,seo_description,og_image_url,status,updated_at";
const SECTION_SELECT =
  "id,section_key,section_type,title,subtitle,content_json,sort_order,is_visible,status,updated_at";
const PUBLIC_SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

function requestId() {
  return `site_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSection(row) {
  return {
    id: row.id,
    section_key: row.section_key,
    section_type: row.section_type,
    title: row.title || "",
    subtitle: row.subtitle || "",
    content: row.content_json && typeof row.content_json === "object" ? row.content_json : {},
    sort_order: Number(row.sort_order || 0),
    updated_at: row.updated_at || null,
  };
}

function sectionsByKey(rows) {
  const sections = {};
  for (const row of rows || []) {
    sections[row.section_key] = normalizeSection(row);
  }
  return sections;
}

async function loadPublishedPage(slug) {
  const pages = await supabaseRequest(
    `/site_pages?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=${PAGE_SELECT}&limit=1`,
  );
  const page = Array.isArray(pages) && pages.length ? pages[0] : null;

  if (!page?.id) {
    return { page: null, sections: {} };
  }

  const rows = await supabaseRequest(
    `/site_sections?page_id=eq.${encodeURIComponent(
      page.id,
    )}&status=eq.published&is_visible=eq.true&select=${SECTION_SELECT}&order=sort_order.asc`,
  );

  return {
    page,
    sections: sectionsByKey(rows),
  };
}

async function handlePage(req, res, id) {
  const rawSlug = String(firstQueryValue(req.query?.slug) || "").trim().toLowerCase();
  if (!PUBLIC_SLUG_PATTERN.test(rawSlug)) {
    return sendJson(res, 400, { error: "invalid_slug", requestId: id });
  }

  const payload = await loadPublishedPage(rawSlug);
  return sendJson(res, 200, { ok: true, ...payload, requestId: id });
}

async function handleGlobal(req, res, id) {
  const payload = await loadPublishedPage("global");
  return sendJson(res, 200, { ok: true, ...payload, requestId: id });
}

export default async function handler(req, res) {
  const id = requestId();
  res.setHeader("X-Request-Id", id);

  const action = String(firstQueryValue(req.query?.action) || "page");

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }

  try {
    if (action === "global") {
      return await handleGlobal(req, res, id);
    }

    if (action === "page") {
      return await handlePage(req, res, id);
    }

    return sendJson(res, 404, { error: "unknown_action", requestId: id });
  } catch (error) {
    console.warn("[site-content] falling back to empty content", {
      requestId: id,
      action,
      message: error instanceof Error ? error.message : String(error),
    });

    return sendJson(res, 200, {
      ok: false,
      page: null,
      sections: {},
      requestId: id,
    });
  }
}
