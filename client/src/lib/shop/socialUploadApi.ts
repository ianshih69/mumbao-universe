export type SocialMediaFile = {
  fileName: string;
  contentType: string;
  size: number;
  key: string;
  publicUrl: string;
  uploadedAt: string;
};

type PresignedUploadResponse = {
  ok: true;
  uploadUrl: string;
  fileName: string;
  contentType: string;
  size: number;
  key: string;
  publicUrl: string;
};

const adminAuthExpiredMessage = "登入已過期，請重新登入";

async function readError(response: Response) {
  const data = await response.json().catch(() => null);
  return data?.error || `暫存檔上傳失敗（${response.status}）`;
}

export async function uploadSocialMediaFile(
  token: string,
  file: File
): Promise<SocialMediaFile> {
  const presignResponse = await fetch("/api/social-upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });

  if (presignResponse.status === 401) {
    throw new Error(adminAuthExpiredMessage);
  }

  if (!presignResponse.ok) {
    throw new Error(await readError(presignResponse));
  }

  const presignData = (await presignResponse.json()) as PresignedUploadResponse;
  const uploadResponse = await fetch(presignData.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      uploadResponse.status === 403
        ? "R2 拒絕上傳，請確認 bucket CORS 與檔案類型設定。"
        : `檔案上傳到 R2 失敗（${uploadResponse.status}）`
    );
  }

  return {
    fileName: presignData.fileName,
    contentType: presignData.contentType,
    size: presignData.size,
    key: presignData.key,
    publicUrl: presignData.publicUrl,
    uploadedAt: new Date().toISOString(),
  };
}
