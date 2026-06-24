import { randomBytes } from "node:crypto";
import {
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
} from "../server/shopShared.js";

const allowedFileTypes = new Map([
  ["image/jpeg", { extension: "jpg", maxSize: 10 * 1024 * 1024 }],
  ["image/png", { extension: "png", maxSize: 10 * 1024 * 1024 }],
  ["image/webp", { extension: "webp", maxSize: 10 * 1024 * 1024 }],
  ["video/mp4", { extension: "mp4", maxSize: 100 * 1024 * 1024 }],
]);
const presignedUrlExpiresInSeconds = 10 * 60;

function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || "");
  return authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function verifySupabaseAccessToken(accessToken) {
  const supabaseUrl = String(getServerEnv("SUPABASE_URL") || "").replace(/\/$/, "");
  const serviceRoleKey = String(getServerEnv("SUPABASE_SERVICE_ROLE_KEY") || "");

  if (!accessToken) throw createHttpError(401, "Unauthorized.");
  if (!supabaseUrl || !serviceRoleKey) {
    throw createHttpError(500, "Supabase environment variables are not configured.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    throw createHttpError(401, "Unauthorized.");
  }

  return data;
}

async function loadAdminPermissions(roleCode) {
  if (!roleCode) return [];
  if (roleCode === "super_admin") return ["*"];

  const rows = await supabaseRequest(
    `/admin_role_permissions?role_code=eq.${encodeURIComponent(roleCode)}&select=permission_code`
  );

  return Array.isArray(rows)
    ? rows.map((row) => row.permission_code).filter(Boolean)
    : [];
}

async function requireAdmin(req) {
  const authUser = await verifySupabaseAccessToken(getBearerToken(req));
  const profiles = await supabaseRequest(
    `/admin_profiles?auth_user_id=eq.${encodeURIComponent(authUser.id)}&select=*&limit=1`
  );
  const profile = Array.isArray(profiles) ? profiles[0] : null;

  if (!profile || !profile.is_active) {
    throw createHttpError(403, "Permission denied.");
  }

  const permissions = await loadAdminPermissions(profile.role_code);
  const canUpload =
    profile.role_code === "super_admin" ||
    permissions.includes("*") ||
    permissions.includes("social.publish") ||
    permissions.includes("social.manage_connection");

  if (!canUpload) {
    throw createHttpError(403, "Permission denied.");
  }
}

function getTaipeiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value || "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function joinPublicUrl(baseUrl, key) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${normalizedBaseUrl}/${encodedKey}`;
}

async function getR2Config() {
  const bucketName = String(getServerEnv("R2_BUCKET_NAME") || "").trim();
  const accessKeyId = String(getServerEnv("R2_ACCESS_KEY_ID") || "").trim();
  const secretAccessKey = String(getServerEnv("R2_SECRET_ACCESS_KEY") || "").trim();
  const endpoint = String(getServerEnv("R2_ENDPOINT") || "").trim();
  const publicBaseUrl = String(getServerEnv("R2_PUBLIC_BASE_URL") || "").trim();

  if (!bucketName || !accessKeyId || !secretAccessKey || !endpoint || !publicBaseUrl) {
    const error = new Error("R2 environment variables are not configured.");
    error.status = 500;
    throw error;
  }

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  return {
    bucketName,
    PutObjectCommand,
    publicBaseUrl,
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed." });
    }

    const body = await readBody(req);
    const fileName = String(body?.fileName || "").trim();
    const contentType = String(body?.contentType || "").trim().toLowerCase();
    const size = Number(body?.size);
    const fileRule = allowedFileTypes.get(contentType);

    if (!fileName) {
      return sendJson(res, 400, { error: "檔案名稱不可空白。" });
    }

    if (!fileRule) {
      return sendJson(res, 400, {
        error: "不支援此檔案類型，僅接受 JPG、PNG、WebP 與 MP4。",
      });
    }

    if (!Number.isFinite(size) || size <= 0) {
      return sendJson(res, 400, { error: "檔案大小無效。" });
    }

    if (size > fileRule.maxSize) {
      return sendJson(res, 400, {
        error: contentType.startsWith("video/")
          ? "影片檔案不可超過 100MB。"
          : "圖片檔案不可超過 10MB。",
      });
    }

    const { bucketName, publicBaseUrl, client, PutObjectCommand } =
      await getR2Config();
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const key = [
      "social-temp",
      getTaipeiDate(),
      `${Date.now()}-${randomBytes(8).toString("hex")}.${fileRule.extension}`,
    ].join("/");
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: presignedUrlExpiresInSeconds }
    );

    return sendJson(res, 200, {
      ok: true,
      uploadUrl,
      fileName,
      contentType,
      size,
      key,
      publicUrl: joinPublicUrl(publicBaseUrl, key),
    });
  } catch (error) {
    console.error("social upload api error:", {
      message: error instanceof Error ? error.message : String(error),
      status: error?.status || 500,
    });

    return sendJson(res, error?.status || 500, {
      error:
        error?.status === 401
          ? "Unauthorized."
          : error?.status === 400
            ? error.message
            : "無法建立暫存上傳連結，請稍後再試。",
    });
  }
}
