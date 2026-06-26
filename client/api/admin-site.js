import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
} from "../server/shopShared.js";

const PAGE_SELECT = "id,slug,title,page_type,seo_title,seo_description,og_image_url,status,created_at,updated_at";
const SECTION_SELECT =
  "id,page_id,section_key,section_type,title,subtitle,content_json,sort_order,is_visible,status,created_at,updated_at";
const MEDIA_SELECT =
  "id,file_name,original_name,url,thumbnail_url,width,height,size_bytes,mime_type,alt_text,caption,category,usage_hint,status,created_by,created_at,updated_at";
const ADMIN_ROLES = new Set(["super_admin", "admin"]);
const STATUS_VALUES = new Set(["draft", "published", "archived"]);
const MEDIA_STATUS_VALUES = new Set(["published", "archived"]);
const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestId() {
  return `admin_site_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function httpError(status, message, code = "request_failed") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function cleanText(value, maxLength = 500) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw httpError(400, "欄位格式不正確。", "invalid_field");
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw httpError(400, "欄位文字過長。", "field_too_long");
  }
  return trimmed || null;
}

function cleanRequiredText(value, maxLength = 500) {
  const text = cleanText(value, maxLength);
  if (!text) {
    throw httpError(400, "缺少必要欄位。", "required_field");
  }
  return text;
}

function cleanStatus(value, fallback = "published") {
  const status = String(value || fallback).trim();
  if (!STATUS_VALUES.has(status)) {
    throw httpError(400, "狀態不正確。", "invalid_status");
  }
  return status;
}

function cleanMediaStatus(value, fallback = "published") {
  const status = String(value || fallback).trim();
  if (!MEDIA_STATUS_VALUES.has(status)) {
    throw httpError(400, "素材狀態不正確。", "invalid_media_status");
  }
  return status;
}

function ensureUuid(value, label = "id") {
  const id = String(value || "").trim();
  if (!UUID_PATTERN.test(id)) {
    throw httpError(400, `${label} 格式不正確。`, "invalid_id");
  }
  return id;
}

function ensureContentJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "區塊內容格式不正確。", "invalid_content");
  }
  const raw = JSON.stringify(value);
  if (raw.length > 30000) {
    throw httpError(400, "區塊內容過大。", "content_too_large");
  }
  if (/<\s*(script|iframe|object|embed|style)\b/i.test(raw)) {
    throw httpError(400, "區塊內容不可包含不安全 HTML。", "unsafe_content");
  }
  return value;
}

function ensureHttpUrl(value) {
  const url = cleanRequiredText(value, 2000);
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("bad protocol");
    }
  } catch {
    throw httpError(400, "圖片網址格式不正確。", "invalid_url");
  }
  return url;
}

async function verifySupabaseAccessToken(accessToken) {
  const supabaseUrl = getServerEnv("SUPABASE_URL");
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw httpError(500, "Server configuration error.", "server_config");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    throw httpError(401, "請先登入後台。", "unauthorized");
  }
  return data;
}

async function requireCmsAdmin(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw httpError(401, "請先登入後台。", "unauthorized");
  }

  const user = await verifySupabaseAccessToken(token);
  const profiles = await supabaseRequest(
    `/admin_profiles?auth_user_id=eq.${encodeURIComponent(
      user.id,
    )}&is_active=eq.true&select=id,auth_user_id,email,display_name,role_code&limit=1`,
  );
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile?.role_code || !ADMIN_ROLES.has(profile.role_code)) {
    throw httpError(403, "沒有官網內容管理權限。", "forbidden");
  }

  return {
    authUserId: user.id,
    email: profile.email || user.email || "",
    displayName: profile.display_name || profile.email || user.email || "Admin",
    roleCode: profile.role_code,
  };
}

async function getPageBySlug(slug) {
  if (!SLUG_PATTERN.test(slug)) {
    throw httpError(400, "頁面代號格式不正確。", "invalid_slug");
  }
  const rows = await supabaseRequest(
    `/site_pages?slug=eq.${encodeURIComponent(slug)}&select=${PAGE_SELECT}&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getPageById(id) {
  const rows = await supabaseRequest(
    `/site_pages?id=eq.${encodeURIComponent(id)}&select=${PAGE_SELECT}&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getSectionById(id) {
  const rows = await supabaseRequest(
    `/site_sections?id=eq.${encodeURIComponent(id)}&select=${SECTION_SELECT}&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getSectionByKey(pageId, sectionKey) {
  const key = cleanRequiredText(sectionKey, 120);
  const rows = await supabaseRequest(
    `/site_sections?page_id=eq.${encodeURIComponent(pageId)}&section_key=eq.${encodeURIComponent(
      key,
    )}&select=${SECTION_SELECT}&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function writeRevision({ targetType, targetId, beforeJson, afterJson, action, editedBy }) {
  await supabaseRequest("/site_content_revisions", {
    method: "POST",
    body: JSON.stringify({
      target_type: targetType,
      target_id: targetId,
      before_json: beforeJson || null,
      after_json: afterJson || null,
      action,
      edited_by: editedBy || null,
    }),
  });
}

async function handlePages(req, res, id) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }

  const pages = await supabaseRequest(`/site_pages?select=${PAGE_SELECT}&order=slug.asc`);
  return sendJson(res, 200, { pages: Array.isArray(pages) ? pages : [], requestId: id });
}

async function handlePageDetail(req, res, id) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }

  const slug = String(firstQueryValue(req.query?.slug) || "").trim().toLowerCase();
  const page = await getPageBySlug(slug);
  if (!page?.id) {
    throw httpError(404, "找不到頁面。", "page_not_found");
  }

  const sections = await supabaseRequest(
    `/site_sections?page_id=eq.${encodeURIComponent(page.id)}&select=${SECTION_SELECT}&order=sort_order.asc`,
  );
  return sendJson(res, 200, {
    page,
    sections: Array.isArray(sections) ? sections : [],
    requestId: id,
  });
}

async function handleUpdatePage(req, res, id, admin) {
  if (!["PATCH", "POST"].includes(req.method)) {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }

  const body = await readBody(req);
  const page =
    body?.id ? await getPageById(ensureUuid(body.id)) : await getPageBySlug(String(body?.slug || "").trim().toLowerCase());
  if (!page?.id) {
    throw httpError(404, "找不到頁面。", "page_not_found");
  }

  const payload = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) payload.title = cleanRequiredText(body.title, 120);
  if (Object.prototype.hasOwnProperty.call(body, "seo_title")) payload.seo_title = cleanText(body.seo_title, 180);
  if (Object.prototype.hasOwnProperty.call(body, "seo_description")) payload.seo_description = cleanText(body.seo_description, 320);
  if (Object.prototype.hasOwnProperty.call(body, "og_image_url")) payload.og_image_url = cleanText(body.og_image_url, 2000);
  if (Object.prototype.hasOwnProperty.call(body, "status")) payload.status = cleanStatus(body.status);

  if (!Object.keys(payload).length) {
    return sendJson(res, 200, { page, requestId: id });
  }

  const rows = await supabaseRequest(`/site_pages?id=eq.${encodeURIComponent(page.id)}&select=${PAGE_SELECT}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const updated = Array.isArray(rows) && rows.length ? rows[0] : await getPageById(page.id);

  await writeRevision({
    targetType: "site_page",
    targetId: page.id,
    beforeJson: page,
    afterJson: updated,
    action: "update_page",
    editedBy: admin.authUserId,
  });

  return sendJson(res, 200, { page: updated, requestId: id });
}

async function handleUpdateSection(req, res, id, admin) {
  if (!["PATCH", "POST"].includes(req.method)) {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }

  const body = await readBody(req);
  let section = null;
  if (body?.id) {
    section = await getSectionById(ensureUuid(body.id));
  } else if (body?.page_slug && body?.section_key) {
    const page = await getPageBySlug(String(body.page_slug).trim().toLowerCase());
    if (page?.id) section = await getSectionByKey(page.id, body.section_key);
  }

  if (!section?.id) {
    throw httpError(404, "找不到區塊。", "section_not_found");
  }

  const payload = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) payload.title = cleanText(body.title, 160);
  if (Object.prototype.hasOwnProperty.call(body, "subtitle")) payload.subtitle = cleanText(body.subtitle, 500);
  if (Object.prototype.hasOwnProperty.call(body, "content_json")) payload.content_json = ensureContentJson(body.content_json);
  if (Object.prototype.hasOwnProperty.call(body, "sort_order")) {
    const sortOrder = Number.parseInt(String(body.sort_order), 10);
    payload.sort_order = Number.isFinite(sortOrder) ? sortOrder : 0;
  }
  if (Object.prototype.hasOwnProperty.call(body, "is_visible")) payload.is_visible = Boolean(body.is_visible);
  if (Object.prototype.hasOwnProperty.call(body, "status")) payload.status = cleanStatus(body.status);

  if (!Object.keys(payload).length) {
    return sendJson(res, 200, { section, requestId: id });
  }

  const rows = await supabaseRequest(
    `/site_sections?id=eq.${encodeURIComponent(section.id)}&select=${SECTION_SELECT}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  const updated = Array.isArray(rows) && rows.length ? rows[0] : await getSectionById(section.id);

  await writeRevision({
    targetType: "site_section",
    targetId: section.id,
    beforeJson: section,
    afterJson: updated,
    action: "update_section",
    editedBy: admin.authUserId,
  });

  return sendJson(res, 200, { section: updated, requestId: id });
}

async function handleToggleSection(req, res, id, admin) {
  const body = await readBody(req);
  const section = await getSectionById(ensureUuid(body?.id));
  if (!section?.id) {
    throw httpError(404, "找不到區塊。", "section_not_found");
  }

  const rows = await supabaseRequest(
    `/site_sections?id=eq.${encodeURIComponent(section.id)}&select=${SECTION_SELECT}`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_visible: Boolean(body?.is_visible) }),
    },
  );
  const updated = Array.isArray(rows) && rows.length ? rows[0] : await getSectionById(section.id);

  await writeRevision({
    targetType: "site_section",
    targetId: section.id,
    beforeJson: section,
    afterJson: updated,
    action: "toggle_section",
    editedBy: admin.authUserId,
  });

  return sendJson(res, 200, { section: updated, requestId: id });
}

async function handleMediaList(req, res, id) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }
  const category = cleanText(firstQueryValue(req.query?.category), 80);
  const path = category
    ? `/site_media?category=eq.${encodeURIComponent(category)}&select=${MEDIA_SELECT}&order=created_at.desc`
    : `/site_media?select=${MEDIA_SELECT}&order=created_at.desc`;
  const media = await supabaseRequest(path);
  return sendJson(res, 200, { media: Array.isArray(media) ? media : [], requestId: id });
}

function buildMediaPayload(body, admin, partial = false) {
  const payload = {};
  if (!partial || Object.prototype.hasOwnProperty.call(body, "url")) payload.url = ensureHttpUrl(body?.url);
  if (Object.prototype.hasOwnProperty.call(body, "file_name")) payload.file_name = cleanText(body.file_name, 240);
  if (Object.prototype.hasOwnProperty.call(body, "original_name")) payload.original_name = cleanText(body.original_name, 240);
  if (Object.prototype.hasOwnProperty.call(body, "thumbnail_url")) payload.thumbnail_url = cleanText(body.thumbnail_url, 2000);
  if (Object.prototype.hasOwnProperty.call(body, "mime_type")) payload.mime_type = cleanText(body.mime_type, 120);
  if (Object.prototype.hasOwnProperty.call(body, "alt_text")) payload.alt_text = cleanText(body.alt_text, 240);
  if (Object.prototype.hasOwnProperty.call(body, "caption")) payload.caption = cleanText(body.caption, 500);
  if (Object.prototype.hasOwnProperty.call(body, "category")) payload.category = cleanText(body.category, 80);
  if (Object.prototype.hasOwnProperty.call(body, "usage_hint")) payload.usage_hint = cleanText(body.usage_hint, 240);
  if (Object.prototype.hasOwnProperty.call(body, "width")) payload.width = Number.isFinite(Number(body.width)) ? Number(body.width) : null;
  if (Object.prototype.hasOwnProperty.call(body, "height")) payload.height = Number.isFinite(Number(body.height)) ? Number(body.height) : null;
  if (Object.prototype.hasOwnProperty.call(body, "size_bytes")) payload.size_bytes = Number.isFinite(Number(body.size_bytes)) ? Number(body.size_bytes) : null;
  if (Object.prototype.hasOwnProperty.call(body, "status")) payload.status = cleanMediaStatus(body.status);
  if (!partial) payload.created_by = admin.authUserId;
  return payload;
}

async function handleMediaCreate(req, res, id, admin) {
  if (!["POST", "PATCH"].includes(req.method)) {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }
  const body = await readBody(req);
  const payload = buildMediaPayload(body, admin, false);
  const rows = await supabaseRequest(`/site_media?select=${MEDIA_SELECT}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return sendJson(res, 200, { media: Array.isArray(rows) ? rows[0] : null, requestId: id });
}

async function handleMediaUpdate(req, res, id, admin) {
  if (!["PATCH", "POST"].includes(req.method)) {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }
  const body = await readBody(req);
  const mediaId = ensureUuid(body?.id);
  const beforeRows = await supabaseRequest(`/site_media?id=eq.${encodeURIComponent(mediaId)}&select=${MEDIA_SELECT}&limit=1`);
  const before = Array.isArray(beforeRows) && beforeRows.length ? beforeRows[0] : null;
  if (!before?.id) throw httpError(404, "找不到圖片素材。", "media_not_found");

  const payload = buildMediaPayload(body, admin, true);
  delete payload.created_by;
  if (!Object.keys(payload).length) {
    return sendJson(res, 200, { media: before, requestId: id });
  }

  const rows = await supabaseRequest(`/site_media?id=eq.${encodeURIComponent(mediaId)}&select=${MEDIA_SELECT}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const updated = Array.isArray(rows) && rows.length ? rows[0] : before;

  await writeRevision({
    targetType: "site_media",
    targetId: mediaId,
    beforeJson: before,
    afterJson: updated,
    action: "update_media",
    editedBy: admin.authUserId,
  });

  return sendJson(res, 200, { media: updated, requestId: id });
}

async function handleMediaDelete(req, res, id, admin) {
  if (!["DELETE", "POST", "PATCH"].includes(req.method)) {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }
  const body = req.method === "DELETE" ? {} : await readBody(req);
  const mediaId = ensureUuid(firstQueryValue(req.query?.id) || body?.id);
  const beforeRows = await supabaseRequest(`/site_media?id=eq.${encodeURIComponent(mediaId)}&select=${MEDIA_SELECT}&limit=1`);
  const before = Array.isArray(beforeRows) && beforeRows.length ? beforeRows[0] : null;
  if (!before?.id) throw httpError(404, "找不到圖片素材。", "media_not_found");

  const rows = await supabaseRequest(`/site_media?id=eq.${encodeURIComponent(mediaId)}&select=${MEDIA_SELECT}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "archived" }),
  });
  const updated = Array.isArray(rows) && rows.length ? rows[0] : before;
  await writeRevision({
    targetType: "site_media",
    targetId: mediaId,
    beforeJson: before,
    afterJson: updated,
    action: "archive_media",
    editedBy: admin.authUserId,
  });
  return sendJson(res, 200, { media: updated, requestId: id });
}

async function handleRevisions(req, res, id) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId: id });
  }
  const targetType = cleanText(firstQueryValue(req.query?.targetType), 80);
  const targetId = cleanText(firstQueryValue(req.query?.targetId), 80);
  let path = "/site_content_revisions?select=*&order=created_at.desc&limit=50";
  if (targetType && targetId && UUID_PATTERN.test(targetId)) {
    path = `/site_content_revisions?target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${encodeURIComponent(
      targetId,
    )}&select=*&order=created_at.desc&limit=50`;
  }
  const revisions = await supabaseRequest(path);
  return sendJson(res, 200, { revisions: Array.isArray(revisions) ? revisions : [], requestId: id });
}

export default async function handler(req, res) {
  const id = requestId();
  res.setHeader("X-Request-Id", id);
  const action = String(firstQueryValue(req.query?.action) || "");

  try {
    const admin = await requireCmsAdmin(req);

    if (action === "pages") return await handlePages(req, res, id);
    if (action === "page-detail") return await handlePageDetail(req, res, id);
    if (action === "update-page") return await handleUpdatePage(req, res, id, admin);
    if (action === "update-section") return await handleUpdateSection(req, res, id, admin);
    if (action === "toggle-section") return await handleToggleSection(req, res, id, admin);
    if (action === "media-list") return await handleMediaList(req, res, id);
    if (action === "media-create") return await handleMediaCreate(req, res, id, admin);
    if (action === "media-update") return await handleMediaUpdate(req, res, id, admin);
    if (action === "media-delete") return await handleMediaDelete(req, res, id, admin);
    if (action === "revisions") return await handleRevisions(req, res, id);

    return sendJson(res, 404, { error: "unknown_action", requestId: id });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    const message = status >= 500 ? "官網內容管理暫時無法處理，請稍後再試。" : error.message || "請求失敗。";

    console.error("[admin-site] request failed", {
      requestId: id,
      action,
      status,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });

    return sendJson(res, status, {
      error: message,
      code: error?.code || "ADMIN_SITE_ERROR",
      requestId: id,
    });
  }
}
