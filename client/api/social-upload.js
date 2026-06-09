import { randomBytes } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getServerEnv,
  readBody,
  sendJson,
} from "../server/shopShared.js";

const allowedFileTypes = new Map([
  ["image/jpeg", { extension: "jpg", maxSize: 10 * 1024 * 1024 }],
  ["image/png", { extension: "png", maxSize: 10 * 1024 * 1024 }],
  ["image/webp", { extension: "webp", maxSize: 10 * 1024 * 1024 }],
  ["video/mp4", { extension: "mp4", maxSize: 100 * 1024 * 1024 }],
]);
const presignedUrlExpiresInSeconds = 10 * 60;

function requireAdmin(req) {
  const adminPassword = String(getServerEnv("ADMIN_PASSWORD") || "").trim();
  const authHeader = String(req.headers?.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!adminPassword) {
    const error = new Error("ADMIN_PASSWORD is not configured.");
    error.status = 500;
    throw error;
  }

  if (!bearerToken || bearerToken !== adminPassword) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
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

function getR2Config() {
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

  return {
    bucketName,
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
    requireAdmin(req);

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

    const { bucketName, publicBaseUrl, client } = getR2Config();
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
